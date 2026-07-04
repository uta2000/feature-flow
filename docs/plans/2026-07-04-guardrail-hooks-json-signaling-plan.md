# Guardrail Hooks JSON Signaling — Implementation Plan

<!-- PROGRESS INDEX (updated by implementation skills)
Task 1: lib/read-hook-input.js + test — STATUS: done (commit f705ff8) — CURRENT: none
Task 2: antipattern-gate.js + test — STATUS: done (commit 57d10e2) — CURRENT: none
Task 3: model-param-gate.js + test — STATUS: done (commit bf2adec) — CURRENT: none
Task 4: console-warn.js + test — STATUS: done (commit b223c66) — CURRENT: none
Task 5: plan-reminder.js + test — STATUS: done (commit 1996162) — CURRENT: none
Task 6: context7-reminder.js + test — STATUS: done (commit 1b23d59) — CURRENT: none
Task 7: convert verdict-gate.js + update its test — STATUS: done (commit 7fbf54d) — CURRENT: none
Task 8: convert quality-gate.js + new quality-gate.test.js — STATUS: done (commit 753acb5) — CURRENT: none
Task 9: convert lint-file.js + new lint-file.test.js — STATUS: done (commit 0b83d46) — CURRENT: none
Task 10: rewire hooks.json — STATUS: done (commit fb424b5) — CURRENT: none
Task 11: final local verification — STATUS: done (all 12 test files pass; shapes verified e2e) — CURRENT: none
CURRENT: none
-->

> **For Claude:** Read only the PROGRESS INDEX to determine current task. Then read the full section for that specific task only. Tool parameter types: Edit replace_all: boolean (true/false), NOT string. Read offset/limit: number, NOT string.

**Goal:** Fix issue #275 — every guardrail hook in `hooks/hooks.json` currently "blocks" via plain stdout text + `process.exit(0)`, a combination Claude Code silently discards for PreToolUse/PostToolUse/Stop. Make each hook signal via the documented JSON mechanism so blocking, advisory, and session-end gates actually reach Claude.

**Architecture:** Extract every inline `node -e "..."` hook in `hooks/hooks.json` into a standalone tested script under `hooks/scripts/`, sharing one stdin-reading helper (`hooks/scripts/lib/read-hook-input.js`). Three JSON output shapes, kept strictly distinct:
- **PreToolUse deny:** `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"<text>"}}`
- **PostToolUse / PreToolUse advisory:** `{"hookSpecificOutput":{"hookEventName":"<event>","additionalContext":"<text>"}}` (no `permissionDecision` field — omitting it makes no allow/deny decision and preserves default permission flow)
- **Stop block:** top-level `{"decision":"block","reason":"<text>"}` (NOT nested under `hookSpecificOutput`)

Every script keeps the existing fail-open convention (try/catch wrapping `main()`, always `process.exit(0)` on error) and the exact anti-pattern/path-filter regexes from the inline hooks — this issue changes signaling only, never matcher behavior (that's #273's scope).

**Tech Stack:** Plain Node.js (no dependencies), hand-rolled `assert()` test harness matching `verdict-gate.test.js`, `hooks/hooks.json` (Claude Code hook registration format).

---

## Task 1: `lib/read-hook-input.js` — shared stdin-reading helper

**Files:**
- Create: `hooks/scripts/lib/read-hook-input.js`
- Create: `hooks/scripts/lib/read-hook-input.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open — returns `null` on any read/parse failure, never throws.
- Pattern reference file: `hooks/scripts/verdict-gate.js:7-10` (current sync stdin read, now generalized and combined with the JSON.parse fail-open that verdict-gate did separately).
- Function length: single ~10-line function, no sub-helpers needed.
- Files modified: none (net-new files only).
- Design-first: no (both files well under 150 lines).
- Parallelizable: no — this is the shared dependency every other task requires; must land first.

- [ ] **Step 1: Write `hooks/scripts/lib/read-hook-input.js`**

```javascript
'use strict';

const fs = require('fs');

/**
 * Reads the hook payload from stdin (fd 0) synchronously and parses it as JSON.
 * Fails open: returns null on any read error, empty stdin, or invalid JSON —
 * callers must treat null as "no usable payload, exit 0 silently."
 */
function readHookInput() {
  let raw;
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = { readHookInput };
```

- [ ] **Step 2: Write `hooks/scripts/lib/read-hook-input.test.js`**

```javascript
#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const LIB_DIR = path.resolve(__dirname);
const RUN_CMD = `node -e "const {readHookInput}=require('./read-hook-input');process.stdout.write(JSON.stringify(readHookInput()))"`;

function run(input) {
  try {
    return execSync(RUN_CMD, { cwd: LIB_DIR, input, encoding: 'utf8' });
  } catch (err) {
    return err.stdout || '';
  }
}

console.log('=== lib/read-hook-input.js ===');

assert('parses valid JSON stdin and returns the object', (() => {
  const out = run(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/tmp/x.ts' } }));
  const parsed = JSON.parse(out);
  return parsed.tool_name === 'Write' && parsed.tool_input.file_path === '/tmp/x.ts';
})());

assert('returns null for empty stdin', (() => {
  return run('') === 'null';
})());

assert('returns null for invalid JSON stdin', (() => {
  return run('{ not valid json') === 'null';
})());

assert('returns null for whitespace-only stdin', (() => {
  return run('   \n  ') === 'null';
})());

console.log(`\n=== lib/read-hook-input.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/lib/read-hook-input.test.js` exits 0 and prints `4 passed, 0 failed`
- [ ] `echo '{"a":1}' | node -e "console.log(require('/Users/weee/Dev/feature-flow/.worktrees/guardrail-hooks-682e/hooks/scripts/lib/read-hook-input').readHookInput())"` outputs `{ a: 1 }`
- [ ] `printf ''  | node -e "console.log(require('/Users/weee/Dev/feature-flow/.worktrees/guardrail-hooks-682e/hooks/scripts/lib/read-hook-input').readHookInput())"` outputs `null` (empty-stdin edge case)
- [ ] `printf '{bad'  | node -e "console.log(require('/Users/weee/Dev/feature-flow/.worktrees/guardrail-hooks-682e/hooks/scripts/lib/read-hook-input').readHookInput())"` outputs `null` (invalid-JSON edge case)

- [ ] **Step 3: Commit**

```bash
git add hooks/scripts/lib/read-hook-input.js hooks/scripts/lib/read-hook-input.test.js
git commit -m "feat(hooks): add shared read-hook-input stdin helper"
```

---

## Task 2: `antipattern-gate.js` — PreToolUse deny for `any`/`as any`/empty catch

**Files:**
- Create: `hooks/scripts/antipattern-gate.js`
- Create: `hooks/scripts/antipattern-gate.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open try/catch around `main()`, `process.exit(0)` on error — matches `verdict-gate.js:74-77`.
- Pattern reference file: `hooks/scripts/verdict-gate.js` (overall shape); regex logic copied verbatim from the two inline `node -e` commands under `hooks.json` PreToolUse `Write` (2nd hook) and PreToolUse `Edit` (1st hook).
- Function length: `main()` ~25 lines, two small pure helpers.
- Files modified: none (net-new).
- Design-first: no (~70 lines).
- Parallelizable: yes (relative to Tasks 3–9; depends only on Task 1).

- [ ] **Step 1: Write `hooks/scripts/antipattern-gate.js`**

```javascript
#!/usr/bin/env node
'use strict';

const { readHookInput } = require('./lib/read-hook-input');

const SRC_FILE = /\/src\/.*\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.(test|spec|d)\.(ts|tsx|js|jsx)$/;
const TYPES_DIR = /\/types\//;

function isCoveredFile(f) {
  return SRC_FILE.test(f) && !TEST_FILE.test(f) && !TYPES_DIR.test(f);
}

function findAntiPatterns(lines, withLineNumbers) {
  const findings = [];
  lines.forEach((line, idx) => {
    const prefix = withLineNumbers ? `L${idx + 1}: ` : '';
    if (/:\s*any\b/.test(line) && !/\/\//.test(line.split('any')[0])) {
      findings.push(`${prefix}\`any\` type — use a specific type or \`unknown\``);
    }
    if (/\bas\s+any\b/.test(line) && !/\/\//.test(line.split('as')[0])) {
      findings.push(`${prefix}\`as any\` — use a proper type assertion`);
    }
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
      findings.push(`${prefix}empty catch block — handle or rethrow the error`);
    }
  });
  return findings;
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!isCoveredFile(filePath)) process.exit(0);

  let text, withLineNumbers;
  if (toolName === 'Write') {
    text = toolInput.content || '';
    withLineNumbers = true;
  } else if (toolName === 'Edit') {
    text = toolInput.new_string || '';
    withLineNumbers = false;
  } else {
    process.exit(0);
  }

  const findings = findAntiPatterns(text.split('\n'), withLineNumbers);
  if (findings.length === 0) process.exit(0);

  const verb = toolName === 'Write' ? 'writing' : 'editing';
  const name = filePath.split('/').pop();
  deny(`Fix these anti-patterns before ${verb} ${name}:\n${findings.join('\n')}`);
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[antipattern-gate] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
```

- [ ] **Step 2: Write `hooks/scripts/antipattern-gate.test.js`**

```javascript
#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const SCRIPT = path.resolve(__dirname, 'antipattern-gate.js');

function run(payload) {
  try {
    const out = execSync(`node ${SCRIPT}`, { input: JSON.stringify(payload), encoding: 'utf8' });
    return { exitCode: 0, stdout: out };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '' };
  }
}

function denyReason(r) {
  try {
    const parsed = JSON.parse(r.stdout);
    if (parsed.hookSpecificOutput?.permissionDecision !== 'deny') return null;
    return parsed.hookSpecificOutput.permissionDecisionReason || '';
  } catch {
    return null;
  }
}

console.log('=== antipattern-gate.js ===');

assert('denies Write with `: any` in a covered src file', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.ts', content: 'const x: any = 1;' } });
  const reason = denyReason(r);
  return r.exitCode === 0 && reason && reason.includes('L1') && reason.includes('`any`');
})());

assert('denies Write with `as any`', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.ts', content: 'const x = y as any;' } });
  const reason = denyReason(r);
  return reason && reason.includes('as any');
})());

assert('denies Write with empty catch block', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.ts', content: 'try { f(); } catch (e) {}' } });
  const reason = denyReason(r);
  return reason && reason.includes('empty catch');
})());

assert('exempts `any` occurring after a `//` comment marker on the same line', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.ts', content: '// eslint-disable-next-line: any' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('denies Edit with `: any` in new_string (no line numbers)', (() => {
  const r = run({ tool_name: 'Edit', tool_input: { file_path: '/repo/src/foo.ts', new_string: 'const x: any = 1;' } });
  const reason = denyReason(r);
  return reason && !reason.includes('L1') && reason.includes('`any`');
})());

assert('exits 0 silently for a file outside /src/', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/lib/foo.ts', content: 'const x: any = 1;' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a test file under /src/', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.test.ts', content: 'const x: any = 1;' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a /types/ file under /src/', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/src/types/foo.ts', content: 'const x: any = 1;' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a clean file', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.ts', content: 'const x: number = 1;' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for an unrelated tool_name (e.g. Bash)', (() => {
  const r = run({ tool_name: 'Bash', tool_input: { command: 'ls' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on empty stdin', (() => {
  const r = run('');
  const out = execSync(`node ${SCRIPT}`, { input: '', encoding: 'utf8' });
  return out.trim() === '';
})());

assert('exits 0 silently on invalid JSON stdin', (() => {
  let out;
  try { out = execSync(`node ${SCRIPT}`, { input: '{ not json', encoding: 'utf8' }); }
  catch (err) { out = err.stdout || ''; }
  return out.trim() === '';
})());

assert('exits 0 silently when tool_input is missing entirely', (() => {
  const r = run({ tool_name: 'Write' });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

console.log(`\n=== antipattern-gate.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/antipattern-gate.test.js` exits 0, all assertions `ok`
- [ ] `echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/src/foo.ts","content":"const x: any = 1;"}}' | node hooks/scripts/antipattern-gate.js` outputs JSON where `.hookSpecificOutput.permissionDecision === "deny"`
- [ ] `echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/src/foo.ts","content":"const x = 1;"}}' | node hooks/scripts/antipattern-gate.js` outputs nothing (empty stdout)
- [ ] `printf '' | node hooks/scripts/antipattern-gate.js; echo "exit:$?"` prints `exit:0` with empty stdout (empty-stdin edge case)
- [ ] `printf '{bad' | node hooks/scripts/antipattern-gate.js; echo "exit:$?"` prints `exit:0` with empty stdout (invalid-JSON edge case)

- [ ] **Step 3: Commit**

```bash
git add hooks/scripts/antipattern-gate.js hooks/scripts/antipattern-gate.test.js
git commit -m "feat(hooks): add antipattern-gate.js with PreToolUse deny signaling"
```

---

## Task 3: `model-param-gate.js` — PreToolUse deny for missing `model` param

**Files:**
- Create: `hooks/scripts/model-param-gate.js`
- Create: `hooks/scripts/model-param-gate.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open try/catch around `main()`, exit 0 on error.
- Pattern reference file: `hooks/scripts/verdict-gate.js`; message text copied verbatim from the inline PreToolUse `Agent`/`Task` hooks in `hooks.json`.
- Function length: `main()` ~15 lines.
- Files modified: none (net-new).
- Design-first: no.
- Parallelizable: yes (relative to Tasks 2, 4–9; depends only on Task 1).

- [ ] **Step 1: Write `hooks/scripts/model-param-gate.js`**

```javascript
#!/usr/bin/env node
'use strict';

const { readHookInput } = require('./lib/read-hook-input');

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolInput = payload.tool_input || {};
  if (!toolInput.subagent_type) process.exit(0);
  if (toolInput.model) process.exit(0);

  deny(
    `Task/Agent dispatch to "${toolInput.subagent_type}" is missing explicit \`model\` parameter. ` +
    `Set model: "haiku" (Explore), "sonnet" (general-purpose/Plan), or "opus" (creative phases). ` +
    `See references/tool-api.md.`
  );
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[model-param-gate] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
```

- [ ] **Step 2: Write `hooks/scripts/model-param-gate.test.js`**

```javascript
#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const SCRIPT = path.resolve(__dirname, 'model-param-gate.js');

function run(payload) {
  try {
    const out = execSync(`node ${SCRIPT}`, { input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });
    return { exitCode: 0, stdout: out };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '' };
  }
}

function denyReason(r) {
  try {
    const parsed = JSON.parse(r.stdout);
    if (parsed.hookSpecificOutput?.permissionDecision !== 'deny') return null;
    return parsed.hookSpecificOutput.permissionDecisionReason || '';
  } catch {
    return null;
  }
}

console.log('=== model-param-gate.js ===');

assert('denies a Task dispatch with subagent_type but no model', (() => {
  const r = run({ tool_name: 'Task', tool_input: { subagent_type: 'general-purpose', prompt: 'do stuff' } });
  const reason = denyReason(r);
  return reason && reason.includes('general-purpose') && reason.includes('model');
})());

assert('denies an Agent dispatch with subagent_type but no model', (() => {
  const r = run({ tool_name: 'Agent', tool_input: { subagent_type: 'Explore', description: 'search' } });
  const reason = denyReason(r);
  return reason && reason.includes('Explore');
})());

assert('exits 0 silently when model is present', (() => {
  const r = run({ tool_name: 'Task', tool_input: { subagent_type: 'general-purpose', model: 'sonnet' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when subagent_type is absent (not a dispatch)', (() => {
  const r = run({ tool_name: 'Task', tool_input: { prompt: 'x' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on empty stdin', (() => {
  const r = run('');
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on invalid JSON stdin', (() => {
  const r = run('{ not json');
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when tool_input is missing entirely', (() => {
  const r = run({ tool_name: 'Task' });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

console.log(`\n=== model-param-gate.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/model-param-gate.test.js` exits 0, all assertions `ok`
- [ ] `echo '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose"}}' | node hooks/scripts/model-param-gate.js` outputs JSON where `.hookSpecificOutput.permissionDecision === "deny"`
- [ ] `echo '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose","model":"sonnet"}}' | node hooks/scripts/model-param-gate.js` outputs nothing
- [ ] `printf '' | node hooks/scripts/model-param-gate.js; echo "exit:$?"` prints `exit:0` with empty stdout
- [ ] `printf '{bad' | node hooks/scripts/model-param-gate.js; echo "exit:$?"` prints `exit:0` with empty stdout

- [ ] **Step 3: Commit**

```bash
git add hooks/scripts/model-param-gate.js hooks/scripts/model-param-gate.test.js
git commit -m "feat(hooks): add model-param-gate.js with PreToolUse deny signaling"
```

---

## Task 4: `console-warn.js` — PostToolUse advisory for `console.log`/`console.debug`

**Files:**
- Create: `hooks/scripts/console-warn.js`
- Create: `hooks/scripts/console-warn.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open try/catch around `main()`, exit 0 on error.
- Pattern reference file: `hooks/scripts/verdict-gate.js`; regex/messages copied verbatim from the inline PostToolUse `Write` (2nd hook) and `Edit` (1st hook) commands.
- Function length: `main()` ~25 lines, one small pure helper (`hasConsoleWarn`).
- Files modified: none (net-new).
- Design-first: no.
- Parallelizable: yes (relative to Tasks 2, 3, 5–9; depends only on Task 1).

- [ ] **Step 1: Write `hooks/scripts/console-warn.js`**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { readHookInput } = require('./lib/read-hook-input');

const SRC_FILE = /\/src\/.*\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.(test|spec|d)\.(ts|tsx|js|jsx)$/;
const TYPES_DIR = /\/types\//;

function isCoveredFile(f) {
  return SRC_FILE.test(f) && !TEST_FILE.test(f) && !TYPES_DIR.test(f);
}

function hasConsoleWarn(line) {
  return /console\.(log|debug)\(/.test(line) && !/\/\//.test(line.split('console')[0]);
}

function advise(context) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: context,
    },
  }));
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!isCoveredFile(filePath)) process.exit(0);

  const name = filePath.split('/').pop();

  if (toolName === 'Write') {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      process.exit(0);
    }
    const warnings = [];
    content.split('\n').forEach((line, idx) => {
      if (hasConsoleWarn(line)) warnings.push(`L${idx + 1}: console.log/debug`);
    });
    if (warnings.length === 0) process.exit(0);
    advise(`[feature-flow] Debug statements in ${name}:\n${warnings.join('\n')}\nRemember to remove before self-review.`);
  } else if (toolName === 'Edit') {
    const newString = toolInput.new_string || '';
    const hit = newString.split('\n').some(hasConsoleWarn);
    if (!hit) process.exit(0);
    advise(`[feature-flow] console.log/debug added in ${name}. Remember to remove before self-review.`);
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[console-warn] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
```

- [ ] **Step 2: Write `hooks/scripts/console-warn.test.js`**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const SCRIPT = path.resolve(__dirname, 'console-warn.js');
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'console-warn-')); }

function run(payload) {
  try {
    const out = execSync(`node ${SCRIPT}`, { input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });
    return { exitCode: 0, stdout: out };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '' };
  }
}

function advisoryContext(r) {
  try {
    const parsed = JSON.parse(r.stdout);
    return parsed.hookSpecificOutput?.additionalContext || null;
  } catch {
    return null;
  }
}

console.log('=== console-warn.js ===');

assert('Write: advises with additionalContext when file on disk contains console.log', (() => {
  const tmp = mkTmp();
  const filePath = path.join(tmp, 'src', 'foo.ts');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'const x = 1;\nconsole.log(x);\n');
  const r = run({ tool_name: 'Write', tool_input: { file_path: filePath, content: 'const x = 1;\nconsole.log(x);\n' } });
  fs.rmSync(tmp, { recursive: true });
  const ctx = advisoryContext(r);
  return ctx && ctx.includes('L2') && ctx.includes('console.log/debug');
})());

assert('Write: exits 0 silently when file has no console.log/debug', (() => {
  const tmp = mkTmp();
  const filePath = path.join(tmp, 'src', 'foo.ts');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'const x = 1;\n');
  const r = run({ tool_name: 'Write', tool_input: { file_path: filePath, content: 'const x = 1;\n' } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('Edit: advises with additionalContext when new_string contains console.debug', (() => {
  const r = run({ tool_name: 'Edit', tool_input: { file_path: '/repo/src/foo.ts', new_string: 'console.debug("hi");' } });
  const ctx = advisoryContext(r);
  return ctx && ctx.includes('console.log/debug added');
})());

assert('exits 0 silently for a file outside /src/', (() => {
  const r = run({ tool_name: 'Edit', tool_input: { file_path: '/repo/lib/foo.ts', new_string: 'console.log(1);' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a /types/ file under /src/', (() => {
  const r = run({ tool_name: 'Edit', tool_input: { file_path: '/repo/src/types/foo.ts', new_string: 'console.log(1);' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when Write file_path does not exist on disk', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/src/does-not-exist.ts', content: 'console.log(1);' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on empty stdin', (() => {
  const r = run('');
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on invalid JSON stdin', (() => {
  const r = run('{ not json');
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when tool_input is missing entirely', (() => {
  const r = run({ tool_name: 'Edit' });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

console.log(`\n=== console-warn.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/console-warn.test.js` exits 0, all assertions `ok`
- [ ] `echo '{"tool_name":"Edit","tool_input":{"file_path":"/repo/src/foo.ts","new_string":"console.log(1);"}}' | node hooks/scripts/console-warn.js` outputs JSON where `.hookSpecificOutput.additionalContext` is a non-empty string
- [ ] `printf '' | node hooks/scripts/console-warn.js; echo "exit:$?"` prints `exit:0` with empty stdout
- [ ] `printf '{bad' | node hooks/scripts/console-warn.js; echo "exit:$?"` prints `exit:0` with empty stdout

- [ ] **Step 3: Commit**

```bash
git add hooks/scripts/console-warn.js hooks/scripts/console-warn.test.js
git commit -m "feat(hooks): add console-warn.js with PostToolUse additionalContext signaling"
```

---

## Task 5: `plan-reminder.js` — PostToolUse advisory for plan-file writes

**Files:**
- Create: `hooks/scripts/plan-reminder.js`
- Create: `hooks/scripts/plan-reminder.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open try/catch around `main()`, exit 0 on error.
- Pattern reference file: `hooks/scripts/verdict-gate.js`. Message text copied verbatim from the inline PostToolUse `Write` (1st hook, a shell `if echo "$CLAUDE_FILE_PATH" | grep -q ...` command). Per the design-verification addendum, `$CLAUDE_FILE_PATH` is not a documented hook env var and this hook has likely never fired — it is rewritten to read `tool_input.file_path` from stdin JSON like its sibling hooks.
- Function length: `main()` ~10 lines.
- Files modified: none (net-new).
- Design-first: no.
- Parallelizable: yes (relative to Tasks 2–4, 6–9; depends only on Task 1).

- [ ] **Step 1: Write `hooks/scripts/plan-reminder.js`**

```javascript
#!/usr/bin/env node
'use strict';

const { readHookInput } = require('./lib/read-hook-input');

function advise(context) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: context,
    },
  }));
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!/plans\/.*\.md/.test(filePath)) process.exit(0);

  advise(
    '[feature-flow] Plan file written. Run verify-plan-criteria before proceeding. ' +
    '(YOLO mode: this step runs automatically as part of the lifecycle — continue without pausing.)'
  );
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[plan-reminder] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
```

- [ ] **Step 2: Write `hooks/scripts/plan-reminder.test.js`**

```javascript
#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const SCRIPT = path.resolve(__dirname, 'plan-reminder.js');

function run(payload) {
  try {
    const out = execSync(`node ${SCRIPT}`, { input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });
    return { exitCode: 0, stdout: out };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '' };
  }
}

function advisoryContext(r) {
  try {
    const parsed = JSON.parse(r.stdout);
    return parsed.hookSpecificOutput?.additionalContext || null;
  } catch {
    return null;
  }
}

console.log('=== plan-reminder.js ===');

assert('advises when a docs/plans/*.md file is written', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/docs/plans/2026-07-04-foo-plan.md', content: '# plan' } });
  const ctx = advisoryContext(r);
  return ctx && ctx.includes('verify-plan-criteria');
})());

assert('exits 0 silently for a non-plan markdown file', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/docs/README.md', content: 'x' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a non-markdown file under plans/', (() => {
  const r = run({ tool_name: 'Write', tool_input: { file_path: '/repo/docs/plans/data.json', content: '{}' } });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on empty stdin', (() => {
  const r = run('');
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on invalid JSON stdin', (() => {
  const r = run('{ not json');
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when tool_input is missing entirely', (() => {
  const r = run({ tool_name: 'Write' });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

console.log(`\n=== plan-reminder.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/plan-reminder.test.js` exits 0, all assertions `ok`
- [ ] `echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/docs/plans/x-plan.md"}}' | node hooks/scripts/plan-reminder.js` outputs JSON where `.hookSpecificOutput.additionalContext` includes `"verify-plan-criteria"`
- [ ] `printf '' | node hooks/scripts/plan-reminder.js; echo "exit:$?"` prints `exit:0` with empty stdout
- [ ] `printf '{bad' | node hooks/scripts/plan-reminder.js; echo "exit:$?"` prints `exit:0` with empty stdout

- [ ] **Step 3: Commit**

```bash
git add hooks/scripts/plan-reminder.js hooks/scripts/plan-reminder.test.js
git commit -m "feat(hooks): add plan-reminder.js reading stdin JSON instead of dead CLAUDE_FILE_PATH env var"
```

---

## Task 6: `context7-reminder.js` — PreToolUse advisory for new source files

**Doc-check decision (resolved during plan-writing, 2026-07-04):** Fetched `https://code.claude.com/docs/en/hooks` and confirmed PreToolUse's `hookSpecificOutput` DOES support `additionalContext` as an advisory field alongside `permissionDecision` — e.g. `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","additionalContext":"..."}}`. Because this hook only ever advises (never blocks), the implementation below omits `permissionDecision` entirely — including `"allow"` would be an explicit allow decision, which bypasses the normal permission system and could suppress a prompt the user would otherwise see. Bare `additionalContext` makes no decision and lets default permission handling proceed unaffected.

**Fallback branch (only exercise if live smoke-testing in a real session shows PreToolUse `additionalContext` does not surface to Claude in practice, contradicting the docs):** move the identical gating logic to a **PostToolUse** hook on the `Write` matcher instead, emitting `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"..."}}`, and register it in `hooks.json`'s `PostToolUse.Write` array (alongside `plan-reminder.js`, `console-warn.js`, `lint-file.js`) rather than `PreToolUse.Write`. The script content is identical either way except the `hookEventName` string and the `hooks.json` wiring location — Task 10 wires the primary (PreToolUse) branch; if the fallback is later needed, only the `hooks.json` matcher location and this one string change.

**Files:**
- Create: `hooks/scripts/context7-reminder.js`
- Create: `hooks/scripts/context7-reminder.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open try/catch around `main()`, exit 0 on error.
- Pattern reference file: `hooks/scripts/verdict-gate.js`. Path/config-gating logic copied verbatim from the inline PreToolUse `Write` (1st hook) command.
- Function length: `main()` ~20 lines.
- Files modified: none (net-new).
- Design-first: no.
- Parallelizable: yes (relative to Tasks 2–5, 7–9; depends only on Task 1).

- [ ] **Step 1: Write `hooks/scripts/context7-reminder.js`**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { readHookInput } = require('./lib/read-hook-input');

const SRC_FILE = /\/src\/.*\.(ts|tsx|js|jsx|py|rb|go|rs)$/;
const TEST_FILE = /\.(test|spec|d)\.(ts|tsx|js|jsx)$/;
const TYPES_DIR = /\/types\//;

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!SRC_FILE.test(filePath)) process.exit(0);
  if (TEST_FILE.test(filePath) || TYPES_DIR.test(filePath)) process.exit(0);
  if (!fs.existsSync('.feature-flow.yml')) process.exit(0);

  const yml = fs.readFileSync('.feature-flow.yml', 'utf8');
  if (!yml.includes('context7:')) process.exit(0);

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        '[feature-flow] REQUIRED: Before creating this source file, you MUST have queried Context7 docs ' +
        'for current patterns. Read the context7 field in .feature-flow.yml for library IDs, then query ' +
        'relevant libraries using mcp__plugin_context7_context7__query-docs.',
    },
  }));
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[context7-reminder] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
```

- [ ] **Step 2: Write `hooks/scripts/context7-reminder.test.js`**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const SCRIPT = path.resolve(__dirname, 'context7-reminder.js');
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'context7-reminder-')); }

function run(cwd, payload) {
  try {
    const out = execSync(`node ${SCRIPT}`, { cwd, input: typeof payload === 'string' ? payload : JSON.stringify(payload), encoding: 'utf8' });
    return { exitCode: 0, stdout: out };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '' };
  }
}

function advisoryContext(r) {
  try {
    const parsed = JSON.parse(r.stdout);
    return parsed.hookSpecificOutput?.additionalContext || null;
  } catch {
    return null;
  }
}

console.log('=== context7-reminder.js ===');

assert('advises (additionalContext, no permissionDecision) when .feature-flow.yml has context7: and file is a covered src file', (() => {
  const tmp = mkTmp();
  fs.writeFileSync(path.join(tmp, '.feature-flow.yml'), 'stack:\n  - node\ncontext7:\n  - node\n');
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.ts' } });
  fs.rmSync(tmp, { recursive: true });
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return false; }
  const ctx = parsed.hookSpecificOutput?.additionalContext || '';
  return ctx.includes('Context7') && parsed.hookSpecificOutput.permissionDecision === undefined;
})());

assert('exits 0 silently when .feature-flow.yml is absent', (() => {
  const tmp = mkTmp();
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.ts' } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when .feature-flow.yml lacks a context7: field', (() => {
  const tmp = mkTmp();
  fs.writeFileSync(path.join(tmp, '.feature-flow.yml'), 'stack:\n  - node\n');
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.ts' } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a file outside /src/', (() => {
  const tmp = mkTmp();
  fs.writeFileSync(path.join(tmp, '.feature-flow.yml'), 'context7:\n  - node\n');
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: '/repo/lib/foo.ts' } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a test file under /src/', (() => {
  const tmp = mkTmp();
  fs.writeFileSync(path.join(tmp, '.feature-flow.yml'), 'context7:\n  - node\n');
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: '/repo/src/foo.test.ts' } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on empty stdin', (() => {
  const tmp = mkTmp();
  const r = run(tmp, '');
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on invalid JSON stdin', (() => {
  const tmp = mkTmp();
  const r = run(tmp, '{ not json');
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when tool_input is missing entirely', (() => {
  const tmp = mkTmp();
  fs.writeFileSync(path.join(tmp, '.feature-flow.yml'), 'context7:\n  - node\n');
  const r = run(tmp, { tool_name: 'Write' });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

console.log(`\n=== context7-reminder.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/context7-reminder.test.js` exits 0, all assertions `ok`
- [ ] In a tmp dir with `.feature-flow.yml` containing `context7:`: `echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/src/foo.ts"}}' | node <path-to>/context7-reminder.js` outputs JSON with `.hookSpecificOutput.additionalContext` set and no `permissionDecision` key
- [ ] `printf '' | node hooks/scripts/context7-reminder.js; echo "exit:$?"` prints `exit:0` with empty stdout
- [ ] `printf '{bad' | node hooks/scripts/context7-reminder.js; echo "exit:$?"` prints `exit:0` with empty stdout

- [ ] **Step 3: Commit**

```bash
git add hooks/scripts/context7-reminder.js hooks/scripts/context7-reminder.test.js
git commit -m "feat(hooks): add context7-reminder.js delivering via PreToolUse additionalContext"
```

---

## Task 7: Convert `verdict-gate.js` to PreToolUse deny JSON

**Files:**
- Modify: `hooks/scripts/verdict-gate.js`
- Modify: `hooks/scripts/verdict-gate.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open try/catch (unchanged, already present at file bottom).
- Pattern reference file: itself — signaling shape changes to match `antipattern-gate.js`/`model-param-gate.js`.
- Function length: `main()` shrinks (stdin-reading inlined into the shared lib call).
- Files modified: `hooks/scripts/verdict-gate.js`, `hooks/scripts/verdict-gate.test.js`.
- Design-first: no (`verdict-gate.js` is 77 lines; `verdict-gate.test.js` is 157 lines — **design-first: yes** for the test file per the >150-line threshold, though only 2 assertions change).
- Parallelizable: yes relative to Tasks 2–6, 8, 9 (touches only these two files); no relative to Task 10 (hooks.json rewire must happen after this lands, though it doesn't change the `hooks.json` wiring for this hook — the Skill matcher already points at the script file).

- [ ] **Step 1: Replace the stdin-read block in `hooks/scripts/verdict-gate.js`**

Replace lines 4–10:

```javascript
const fs = require('fs');
const path = require('path');

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); }
  catch { return ''; }
}
```

with:

```javascript
const fs = require('fs');
const path = require('path');
const { readHookInput } = require('./lib/read-hook-input');
```

- [ ] **Step 2: Replace the payload-parsing block in `main()`**

Replace lines 30–41 (original, before Step 1's edit shifts them — apply by matching the text, not the line numbers):

```javascript
function main() {
  const raw = readStdinSync();
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch (err) {
    try { process.stderr.write(`[verdict-gate] hook payload not valid JSON: ${err && err.message}; fail-open\n`); } catch (_) { /* stderr unavailable */ }
    process.exit(0);
  }

  const toolName = payload.tool_name || '';
  if (toolName !== 'Skill') process.exit(0);
```

with:

```javascript
function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolName = payload.tool_name || '';
  if (toolName !== 'Skill') process.exit(0);
```

- [ ] **Step 3: Replace the block-construction and `console.log` at the end of `main()`**

Replace:

```javascript
  const signalStr = pending.signal_key ? ` (signal: ${pending.signal_key})` : '';
  const block = [
    `BLOCK: Consultation ${pending.id} (mode: ${pending.mode}${signalStr}) requires a verdict before any other skill call.`,
    'This is a sequencing block, not a prohibition — record the verdict and your next call can proceed.',
    '',
    `Invoke: Skill(skill: "feature-flow:consult-codex", args: "verdict --id ${pending.id} --decision <accept|reject> --reason <short text>")`,
    '',
    '- accept: you will apply codex\'s recommendation',
    '- reject: you will not apply it (reason must reference what\'s already been tried)'
  ].join('\n');

  console.log(block);
  process.exit(0);
```

with:

```javascript
  const signalStr = pending.signal_key ? ` (signal: ${pending.signal_key})` : '';
  const reason = [
    `Consultation ${pending.id} (mode: ${pending.mode}${signalStr}) requires a verdict before any other skill call.`,
    'This is a sequencing block, not a prohibition — record the verdict and your next call can proceed.',
    '',
    `Invoke: Skill(skill: "feature-flow:consult-codex", args: "verdict --id ${pending.id} --decision <accept|reject> --reason <short text>")`,
    '',
    '- accept: you will apply codex\'s recommendation',
    '- reject: you will not apply it (reason must reference what\'s already been tried)'
  ].join('\n');

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
```

- [ ] **Step 4: Update `hooks/scripts/verdict-gate.test.js` assertion at line 62 (`'blocks non-verdict Skill call when strict consultation is pending'`)**

Replace:

```javascript
  return r.stdout.includes('BLOCK') && r.stdout.includes('c2') && r.stdout.includes('verdict --id c2');
```

with:

```javascript
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return false; }
  const reason = parsed.hookSpecificOutput?.permissionDecisionReason || '';
  return parsed.hookSpecificOutput?.permissionDecision === 'deny'
    && reason.includes('c2')
    && reason.includes('verdict --id c2');
```

- [ ] **Step 5: Update `hooks/scripts/verdict-gate.test.js` assertion at line 153 (`'blocks when skill name does not match consult-codex despite verdict-style args'`)**

Replace:

```javascript
  return r.stdout.includes('BLOCK') && r.stdout.includes('c7');
```

with:

```javascript
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return false; }
  const reason = parsed.hookSpecificOutput?.permissionDecisionReason || '';
  return parsed.hookSpecificOutput?.permissionDecision === 'deny' && reason.includes('c7');
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/verdict-gate.test.js` exits 0 and prints `12 passed, 0 failed` (10 pre-existing assertions — 8 silent-path/exit-code plus the 2 updated deny-path assertions — plus 2 fail-open stdin tests added by the code-review fix pass)
- [ ] `grep -c "console.log(block)" hooks/scripts/verdict-gate.js` outputs `0` (old string-block signal fully removed)
- [ ] A pending-strict-consultation fixture piped through the script (as constructed by the test's `runGate` helper) outputs JSON where `.hookSpecificOutput.permissionDecision === "deny"`

- [ ] **Step 6: Commit**

```bash
git add hooks/scripts/verdict-gate.js hooks/scripts/verdict-gate.test.js
git commit -m "fix(hooks): verdict-gate.js emits PreToolUse deny JSON instead of discarded BLOCK text"
```

---

## Task 8: Convert `quality-gate.js` to Stop `decision:block` JSON, honoring `stop_hook_active`

**Files:**
- Modify: `hooks/scripts/quality-gate.js`
- Create: `hooks/scripts/quality-gate.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open (unchanged — `.finally(() => process.exit(0))` at the bottom stays exactly as-is per the design-verification addendum).
- Pattern reference file: `hooks/scripts/verdict-gate.js` for the deny-JSON convention; `hooks/scripts/quality-gate.js` itself for everything else (marker-skip logic at lines 14–31 is untouched).
- Function length: `main()` grows by ~5 lines (the new stop_hook_active guard); no other functions change.
- Files modified: `hooks/scripts/quality-gate.js`.
- Design-first: **yes** — `quality-gate.js` is 393 lines, over the 150-line threshold. The change here is small and localized (top-of-function guard + one signal line); do not restructure the rest of the file in this task.
- Parallelizable: yes relative to Tasks 2–7, 9 (touches only `quality-gate.js` + its new test file); no relative to Task 10.

- [ ] **Step 1: Add the shared-lib import**

In `hooks/scripts/quality-gate.js`, after line 8 (`const path = require('path');`), add:

```javascript
const { readHookInput } = require('./lib/read-hook-input');
```

- [ ] **Step 2: Add the `stop_hook_active` guard at the top of `main()`**

Replace:

```javascript
async function main() {
  // Skip if lifecycle already verified at this commit with clean working tree
  try {
```

with:

```javascript
async function main() {
  // Respect the harness's loop-protection flag: when a previous Stop block already fired
  // for this turn, re-running the full check suite would just re-block in a loop.
  const payload = readHookInput();
  if (payload && payload.stop_hook_active === true) {
    return;
  }

  // Skip if lifecycle already verified at this commit with clean working tree
  try {
```

- [ ] **Step 3: Replace the failure signal**

Replace:

```javascript
  if (failures.length > 0) {
    const report = failures.join('\n\n');
    const warn = warnings.length > 0 ? '\n\n' + warnings.join('\n') : '';
    console.log(`BLOCK: Code quality checks failed. Fix before ending session:\n\n${report}${warn}`);
  } else if (warnings.length > 0) {
```

with:

```javascript
  if (failures.length > 0) {
    const report = failures.join('\n\n');
    const warn = warnings.length > 0 ? '\n\n' + warnings.join('\n') : '';
    console.log(JSON.stringify({
      decision: 'block',
      reason: `Code quality checks failed. Fix before ending session:\n\n${report}${warn}`,
    }));
  } else if (warnings.length > 0) {
```

- [ ] **Step 4: Write `hooks/scripts/quality-gate.test.js`**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const SCRIPT = path.resolve(__dirname, 'quality-gate.js');
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'quality-gate-')); }

function mkFailingProject(dir) {
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { lint: 'node -e "process.exit(1)"' } })
  );
}

function runGate(cwd, payload) {
  try {
    const out = execSync(`node ${SCRIPT}`, {
      cwd,
      input: payload === undefined ? undefined : (typeof payload === 'string' ? payload : JSON.stringify(payload)),
      encoding: 'utf8',
      timeout: 30000,
    });
    return { exitCode: 0, stdout: out };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

console.log('=== quality-gate.js ===');

assert('empty project: no checks apply, stdout is empty, exits 0', (() => {
  const tmp = mkTmp();
  const r = runGate(tmp, { stop_hook_active: false });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('failing lint script: emits {decision:"block", reason} JSON containing the failure report', (() => {
  const tmp = mkTmp();
  mkFailingProject(tmp);
  const r = runGate(tmp, { stop_hook_active: false });
  fs.rmSync(tmp, { recursive: true });
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return false; }
  return r.exitCode === 0
    && parsed.decision === 'block'
    && typeof parsed.reason === 'string'
    && parsed.reason.includes('Code quality checks failed')
    && parsed.reason.includes('LINT');
})());

assert('stop_hook_active=true: skips checks entirely even with a failing project, no block output', (() => {
  const tmp = mkTmp();
  mkFailingProject(tmp);
  const r = runGate(tmp, { stop_hook_active: true });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('empty stdin (no payload): runs checks normally, treated as stop_hook_active=false', (() => {
  const tmp = mkTmp();
  const r = runGate(tmp, undefined);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('invalid JSON stdin: fails open, runs checks normally', (() => {
  const tmp = mkTmp();
  const r = runGate(tmp, '{ not valid json');
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

console.log(`\n=== quality-gate.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/quality-gate.test.js` exits 0 and prints `6 passed, 0 failed` (5 planned assertions plus the marker-skip short-circuit test added by the code-review fix pass)
- [ ] `grep -c "BLOCK: Code quality" hooks/scripts/quality-gate.js` outputs `0` (old string signal fully removed)
- [ ] `grep -n "stop_hook_active" hooks/scripts/quality-gate.js` finds at least one match
- [ ] In a tmp dir with a `package.json` whose `scripts.lint` exits 1: `echo '{"stop_hook_active":false}' | node hooks/scripts/quality-gate.js` (run with that dir as cwd) outputs JSON with `.decision === "block"` and `.reason` containing `"Code quality checks failed"`
- [ ] Same fixture with `echo '{"stop_hook_active":true}' | node hooks/scripts/quality-gate.js` outputs empty stdout (loop-protection honored)

- [ ] **Step 5: Commit**

```bash
git add hooks/scripts/quality-gate.js hooks/scripts/quality-gate.test.js
git commit -m "fix(hooks): quality-gate.js emits Stop decision:block JSON, honors stop_hook_active"
```

---

## Task 9: Convert `lint-file.js` to PostToolUse advisory JSON

**Files:**
- Modify: `hooks/scripts/lint-file.js`
- Create: `hooks/scripts/lint-file.test.js`

**Quality Constraints:**
- Error handling pattern: fail-open — restructured from the current event-based `process.stdin.on('end', ...)` callback (whose own try/catch only logs to stderr, without a top-level fail-open wrapper) into the `main()` + top-level try/catch pattern used by every other script in this plan, matching `verdict-gate.js:74-77`.
- Pattern reference file: `hooks/scripts/verdict-gate.js` for the fail-open shape; `hooks/scripts/lint-file.js` itself for `isSourceFile`/`runLinter`/`hasEslintConfig`/`hasBiomeConfig`, which are unchanged.
- Function length: `main()` ~15 lines; helpers unchanged.
- Files modified: `hooks/scripts/lint-file.js` (full-file rewrite — the stdin-handling restructure touches the whole top of the file, so replace the entire file content rather than a partial diff).
- Design-first: no (~55 lines after rewrite).
- Parallelizable: yes relative to Tasks 2–8 (touches only `lint-file.js` + its new test file); no relative to Task 10.

- [ ] **Step 1: Rewrite `hooks/scripts/lint-file.js` in full**

```javascript
#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const { readHookInput } = require('./lib/read-hook-input');

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const filePath = payload.tool_input?.file_path || '';
  if (!isSourceFile(filePath)) process.exit(0);

  const errors = runLinter(filePath);
  if (errors) {
    const name = path.basename(filePath);
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `[feature-flow] LINT ERRORS in ${name} — fix these before continuing:\n${errors}`,
      },
    }));
  }
  process.exit(0);
}

function isSourceFile(f) {
  if (!/\.(ts|tsx|js|jsx)$/.test(f)) return false;
  if (/\.(test|spec|d)\.(ts|tsx|js|jsx)$/.test(f)) return false;
  if (/(^|\/)(node_modules|\.next|dist|build|\.git)(\/|$)/.test(f)) return false;
  return true;
}

function runLinter(filePath) {
  const linters = [
    { bin: 'eslint', args: ['eslint', filePath], detect: hasEslintConfig },
    { bin: 'biome', args: ['biome', 'check', filePath], detect: hasBiomeConfig },
  ];

  for (const { bin, args, detect } of linters) {
    if (!existsSync(`node_modules/.bin/${bin}`) || !detect()) continue;
    const result = spawnSync('npx', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0) return null;
    if (result.error || result.signal) return null;
    return (result.stdout || result.stderr || 'Lint errors found').trim();
  }

  return null;
}

function hasEslintConfig() {
  return [
    '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
    '.eslintrc.yml', '.eslintrc.yaml',
    'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  ].some(c => existsSync(c));
}

function hasBiomeConfig() {
  return existsSync('biome.json') || existsSync('biome.jsonc');
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[lint-file] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
```

- [ ] **Step 2: Write `hooks/scripts/lint-file.test.js`**

```javascript
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const SCRIPT = path.resolve(__dirname, 'lint-file.js');
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'lint-file-')); }

function setupFakeLinter(dir, bin, exitCode, output) {
  const binDir = path.join(dir, 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  const scriptPath = path.join(binDir, bin);
  fs.writeFileSync(scriptPath, `#!/bin/sh\necho "${output}"\nexit ${exitCode}\n`);
  fs.chmodSync(scriptPath, 0o755);
  fs.writeFileSync(path.join(dir, '.eslintrc.json'), '{}');
}

function run(cwd, payload) {
  try {
    const out = execSync(`node ${SCRIPT}`, {
      cwd,
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      encoding: 'utf8',
    });
    return { exitCode: 0, stdout: out };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '' };
  }
}

console.log('=== lint-file.js ===');

assert('advises with additionalContext when the fake eslint reports errors', (() => {
  const tmp = mkTmp();
  setupFakeLinter(tmp, 'eslint', 1, 'foo.ts:1:1 error some rule');
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  const filePath = path.join(tmp, 'src', 'foo.ts');
  fs.writeFileSync(filePath, 'const x = 1;');
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: filePath } });
  fs.rmSync(tmp, { recursive: true });
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return false; }
  const ctx = parsed.hookSpecificOutput?.additionalContext || '';
  return ctx.includes('LINT ERRORS') && ctx.includes('some rule');
})());

assert('exits 0 silently when the fake eslint reports no errors', (() => {
  const tmp = mkTmp();
  setupFakeLinter(tmp, 'eslint', 0, '');
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  const filePath = path.join(tmp, 'src', 'foo.ts');
  fs.writeFileSync(filePath, 'const x = 1;');
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: filePath } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a non-source file', (() => {
  const tmp = mkTmp();
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'README.md') } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently for a test file', (() => {
  const tmp = mkTmp();
  setupFakeLinter(tmp, 'eslint', 1, 'would report errors');
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'src', 'foo.test.ts') } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when no linter binary/config is present', (() => {
  const tmp = mkTmp();
  const filePath = path.join(tmp, 'src', 'foo.ts');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'const x = 1;');
  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: filePath } });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on empty stdin', (() => {
  const tmp = mkTmp();
  const r = run(tmp, '');
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently on invalid JSON stdin', (() => {
  const tmp = mkTmp();
  const r = run(tmp, '{ not json');
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when tool_input is missing entirely', (() => {
  const tmp = mkTmp();
  const r = run(tmp, { tool_name: 'Write' });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

console.log(`\n=== lint-file.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

**Acceptance Criteria:**
- [ ] `node hooks/scripts/lint-file.test.js` exits 0 and prints `8 passed, 0 failed`
- [ ] `grep -c "process.stdin.on" hooks/scripts/lint-file.js` outputs `0` (event-based stdin reading fully replaced by the shared sync helper)
- [ ] In a tmp dir with a fake failing `node_modules/.bin/eslint` + `.eslintrc.json`: piping a Write payload through the script outputs JSON with `.hookSpecificOutput.additionalContext` containing `"LINT ERRORS"`
- [ ] `printf '' | node hooks/scripts/lint-file.js; echo "exit:$?"` prints `exit:0` with empty stdout

- [ ] **Step 3: Commit**

```bash
git add hooks/scripts/lint-file.js hooks/scripts/lint-file.test.js
git commit -m "fix(hooks): lint-file.js emits PostToolUse additionalContext JSON via shared stdin helper"
```

---

## Task 10: Rewire `hooks/hooks.json` — replace every inline `node -e` hook, update banner

**Files:**
- Modify: `hooks/hooks.json`

**Quality Constraints:**
- Error handling pattern: N/A (JSON config file, not a script).
- Pattern reference file: existing `hooks/hooks.json` wiring convention — `"node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.js"`, unquoted; `timeout`/`statusMessage` ONLY on subprocess-spawning entries (`lint-file.js`: 30s; `quality-gate.js`: 180s + statusMessage). The 7 new/converted lightweight scripts (`context7-reminder.js`, `antipattern-gate.js`, `model-param-gate.js`, `console-warn.js`, `plan-reminder.js`, plus the already-wired `verdict-gate.js`) get neither.
- Function length: N/A.
- Files modified: `hooks/hooks.json` only.
- Design-first: no (~110 lines after rewrite, under the 150-line threshold).
- Parallelizable: no — depends on every script from Tasks 1–9 existing at their final paths; must run after all of them.

- [ ] **Step 1: Replace the full contents of `hooks/hooks.json`**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/context7-reminder.js"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/antipattern-gate.js"
          }
        ],
        "description": "Context7 reminder (advisory) + deny on any/as any/empty catch in new source files"
      },
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/antipattern-gate.js"
          }
        ],
        "description": "Deny on any/as any/empty catch in edited source files"
      },
      {
        "matcher": "Agent",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/model-param-gate.js"
          }
        ],
        "description": "Deny Task/Agent dispatches missing explicit model parameter"
      },
      {
        "matcher": "Task",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/model-param-gate.js"
          }
        ],
        "description": "Deny Task/Agent dispatches missing explicit model parameter"
      },
      {
        "matcher": "Skill",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/verdict-gate.js"
          }
        ],
        "description": "Deny non-verdict Skill calls when a strict codex consultation has a pending verdict"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/plan-reminder.js"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/console-warn.js"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lint-file.js",
            "timeout": 30
          }
        ],
        "description": "Plan file reminder + console.log/debug warning + per-file lint (all advisory) for source files"
      },
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/console-warn.js"
          },
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/lint-file.js",
            "timeout": 30
          }
        ],
        "description": "console.log/debug warning + per-file lint (both advisory) for edited source files"
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "if [ -f .feature-flow.yml ]; then echo 'FEATURE-FLOW DEVELOPMENT ACTIVE: Use start: to begin any non-trivial work — it orchestrates the full lifecycle (design → verify → implement → ship). Rules: (1) Every task in an implementation plan MUST include **Acceptance Criteria:** with machine-verifiable - [ ] items. After writing a plan, run verify-plan-criteria. (2) Before claiming any task is complete, run verify-acceptance-criteria to mechanically check all criteria against the codebase. (3) Before writing new code, query Context7 docs for current patterns — library IDs are in .feature-flow.yml under context7. (4) PreToolUse hooks deny (block) Write/Edit calls containing any types, as any, or empty catch blocks — fix before writing; Task/Agent dispatches missing an explicit model parameter are denied the same way. console.log/debug is a PostToolUse advisory warning, not a block, and is allowed during TDD. (5) Stop hook runs tsc, lint, and type-sync checks and blocks session end on failures; per-file lint warnings from the PostToolUse hook remain advisory and do not block. (6) Tool API: Skill tool params are skill and args (NOT skill_name/arguments). Deferred tools (TaskCreate, TaskUpdate) must be loaded via ToolSearch before use. See references/tool-api.md for all tool syntax. Type \"start: <description>\" or \"start: <description> --yolo\" to begin.'; if ! grep -q 'context7:' .feature-flow.yml 2>/dev/null; then echo ''; echo 'UPGRADE NOTICE (v1.6.0): Your .feature-flow.yml is missing the context7 field. Run start: to auto-detect Context7 library IDs for your stack, or add them manually. New in v1.6.0: Context7 doc lookups, coding-standards.md, Study Existing Patterns step, Self-Review step, anti-pattern blocking hooks. See CHANGELOG.md for details.'; fi; else echo 'FEATURE-FLOW is installed. It helps you build features without mid-implementation surprises by adding a design and verification layer before you code. To start, just describe what you want to build: \"start: add user notifications\" -- feature-flow will auto-detect your tech stack, resolve Context7 documentation libraries, classify the scope, and walk you through the right steps. For a quick bug fix, just describe the problem — the lifecycle is lightweight: understand, fix, verify, commit. Type \"start: <your idea, issue, or bug>\" to get started. Add --yolo to auto-select defaults.'; fi"
          },
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
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/quality-gate.js",
            "timeout": 180,
            "statusMessage": "Running code quality checks (tsc, lint, type-sync, tests)..."
          }
        ],
        "description": "Block session end while tsc/lint/type-sync/tests fail (Stop decision:block); resumes clean once fixed"
      }
    ]
  }
}
```

**Acceptance Criteria:**
- [ ] `node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'))"` exits 0 (valid JSON)
- [ ] `! grep -q "node -e" hooks/hooks.json` exits 0 (no inline `node -e` hooks remain — note: `grep -c` alone would print `0` but exit 1 on zero matches, so use `grep -q` negated with `!` for a clean exit-0 check)
- [ ] `grep -c "antipattern-gate.js" hooks/hooks.json` outputs `2` (wired under both PreToolUse Write and PreToolUse Edit)
- [ ] `grep -c "model-param-gate.js" hooks/hooks.json` outputs `2` (wired under both PreToolUse Agent and PreToolUse Task)
- [ ] `grep -c "console-warn.js" hooks/hooks.json` outputs `2` (wired under both PostToolUse Write and PostToolUse Edit)
- [ ] `grep -c "context7-reminder.js" hooks/hooks.json` outputs `1` (PreToolUse Write only)
- [ ] `grep -c "plan-reminder.js" hooks/hooks.json` outputs `1` (PostToolUse Write only)
- [ ] `grep -c "verdict-gate.js" hooks/hooks.json` outputs `1` (unchanged wiring, PreToolUse Skill)
- [ ] `grep -c "quality-gate.js" hooks/hooks.json` outputs `1` (unchanged wiring, Stop)
- [ ] `grep -c "lint-file.js" hooks/hooks.json` outputs `2` (unchanged wiring, PostToolUse Write + Edit)
- [ ] `grep -o "console.log/debug is a PostToolUse advisory warning, not a block" hooks/hooks.json` outputs a match (banner rule 4 updated)
- [ ] `grep -o "Stop hook runs tsc, lint, type-sync, and test checks and blocks session end on failures" hooks/hooks.json` outputs a match (banner rule 5 updated; \"and test\" added by pr-review-toolkit auto-fix — the gate does run test suites)

- [ ] **Step 2: Commit**

```bash
git add hooks/hooks.json
git commit -m "fix(hooks): rewire hooks.json to script-based hooks with accurate deny/advisory banner text"
```

---

## Task 11: Final local verification

**Files:**
- None modified — verification only.

**Quality Constraints:**
- Error handling pattern: N/A.
- Pattern reference file: N/A.
- Function length: N/A.
- Files modified: none.
- Design-first: no.
- Parallelizable: no — must run last, after every prior task has landed.

This repo has no CI coverage for hook scripts (confirmed during design verification) — this task's local run is the only safety net before merge. It is also the automatable proxy for "the harness actually enforces this": each fixture pipe below asserts the exact JSON shape the harness consumes, which is as far as a non-interactive check can go. It does **not** replace a live smoke test inside a real Claude Code session (the issue's fifth Acceptance Criterion, "a `src/**.ts` write containing `: any` is actually rejected by the harness") — that remains a manual, one-time confirmation step outside this plan's automated scope, to be run once after merge.

- [ ] **Step 1: Run every hook test file and confirm all exit 0**

```bash
for f in hooks/scripts/lib/read-hook-input.test.js hooks/scripts/antipattern-gate.test.js hooks/scripts/model-param-gate.test.js hooks/scripts/console-warn.test.js hooks/scripts/plan-reminder.test.js hooks/scripts/context7-reminder.test.js hooks/scripts/verdict-gate.test.js hooks/scripts/quality-gate.test.js hooks/scripts/lint-file.test.js; do
  echo "--- $f ---"
  node "$f" || exit 1
done
echo "ALL HOOK TESTS PASSED"
```

Expected: every test file prints its `N passed, 0 failed` summary, the loop does not `exit 1`, and the final line `ALL HOOK TESTS PASSED` is printed.

- [ ] **Step 2: Run the pre-existing (unrelated) hook test files too, to confirm nothing else regressed**

```bash
node hooks/scripts/advisor-hint.test.js
node hooks/scripts/validate-return-contract.test.js
node hooks/scripts/version-check.test.js
```

Expected: all three exit 0 (these were not touched by this plan but share the `hooks/scripts/` directory; confirm no accidental collateral breakage, e.g. from the new `lib/` subdirectory).

- [ ] **Step 3: End-to-end fixture pipe for each converted/new PreToolUse deny hook**

```bash
echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/src/foo.ts","content":"const x: any = 1;"}}' | node hooks/scripts/antipattern-gate.js
echo '{"tool_name":"Task","tool_input":{"subagent_type":"general-purpose"}}' | node hooks/scripts/model-param-gate.js
```

Expected: both print JSON where `.hookSpecificOutput.permissionDecision === "deny"`.

- [ ] **Step 4: End-to-end fixture pipe for each PostToolUse/PreToolUse advisory hook**

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"/repo/src/foo.ts","new_string":"console.log(1);"}}' | node hooks/scripts/console-warn.js
echo '{"tool_name":"Write","tool_input":{"file_path":"/repo/docs/plans/x-plan.md"}}' | node hooks/scripts/plan-reminder.js
```

Expected: both print JSON where `.hookSpecificOutput.additionalContext` is a non-empty string.

- [ ] **Step 5: End-to-end fixture pipe for the Stop block hook**

```bash
mkdir -p /tmp/qg-fixture && cd /tmp/qg-fixture
echo '{"name":"fixture","scripts":{"lint":"node -e \"process.exit(1)\""}}' > package.json
echo '{"stop_hook_active":false}' | node /Users/weee/Dev/feature-flow/.worktrees/guardrail-hooks-682e/hooks/scripts/quality-gate.js
cd - && rm -rf /tmp/qg-fixture
```

Expected: prints JSON where `.decision === "block"` and `.reason` contains `"Code quality checks failed"`.

- [ ] **Step 6: Confirm `hooks.json` is valid and free of inline `node -e` hooks**

```bash
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf8'))" && echo "hooks.json is valid JSON"
! grep -q "node -e" hooks/hooks.json && echo "no inline node -e hooks remain"
```

Expected: both echo lines print.

**Acceptance Criteria:**
- [ ] Step 1's loop completes with `ALL HOOK TESTS PASSED` printed and exit code 0
- [ ] Step 2's three pre-existing test files each exit 0
- [ ] Step 3's two fixture pipes each output `permissionDecision: "deny"` JSON
- [ ] Step 4's two fixture pipes each output non-empty `additionalContext` JSON
- [ ] Step 5's fixture pipe outputs `decision: "block"` JSON with a reason mentioning the failure
- [ ] Step 6's two checks both print their confirmation lines

- [ ] **Step 7: Manual live-smoke reminder (not automated by this plan)**

After merge, in a real Claude Code session with this plugin active, attempt a `Write` to a `src/**.ts` path containing `: any` and confirm the tool call is actually rejected with the deny reason shown to Claude (issue #275's fifth Acceptance Criterion). This is a one-time manual confirmation outside the scope of the automated tests above — record the result in the PR description or the issue comment thread, not as a commit.
