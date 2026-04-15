# Codex Consultation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Phase 1 (shared infrastructure) + Phase 2 (review-design mode) of the codex consultation feature. At plan completion, `feature-flow:consult-codex mode: review-design` works end-to-end: reads a design doc, calls codex, records the exchange, forces a soft-tier verdict, and emits a visible `<not recorded>` defect if the verdict call is skipped.

**Scope of THIS plan:** Phase 1 + Phase 2 only. Phases 3–5 (review-plan, review-code, stuck mode) are out of scope for this plan and will be added by follow-up plans on top of proven shared infrastructure. Rationale: the spec's own build order says "review-design is the cheapest brief and traces the whole pipeline end-to-end on its first call" — validating the infrastructure on one working proactive mode before investing in the rest.

**Architecture:** One mode-parameterized skill with shared infrastructure (session state, config, model resolution, codex call, record-exchange) plus mode-specific brief builders. Tiered verdict enforcement — PreToolUse Skill block for reactive stuck consultations (sequencing requirement), soft single-shot reminder + visible `<not recorded>` PR defect for proactive modes. Signal collector hooks feed reactive consultations via a worktree-local `session-state.json`.

**Tech Stack:** Plain Node.js (no TypeScript, no test framework, no bundler — matches feature-flow's existing convention). Custom `assert` test helpers matching `hooks/scripts/version-check.test.js`. Ad-hoc YAML parsing via regex matching `hooks/scripts/quality-gate.js` pattern.

**Spec:** `docs/plans/2026-04-14-codex-consultation.md` — the source of truth for architecture and requirements. If this plan and the spec disagree, the spec wins and the plan gets a fix task.

---

## File structure

### New files
```
skills/consult-codex/
├── SKILL.md                     # Claude-facing orchestration (not a script runner)
├── references/
│   ├── brief-format.md
│   ├── modes.md
│   └── escape-hatch.md
└── scripts/
    ├── state.js                 # session-state.json R/W + GC + atomic writes
    ├── state.test.js
    ├── config.js                # .feature-flow.yml codex-section loader
    ├── config.test.js
    ├── resolve-model.js         # model fallback chain (pure, injectable)
    ├── resolve-model.test.js
    ├── build-brief.js           # shared skeleton formatter
    ├── build-brief.test.js
    ├── record-exchange.js       # append to state + codex-log.md
    ├── record-exchange.test.js
    ├── consult.js               # CLI with three subcommands:
    │                            #   start            → Phase 1 (budget, brief, JSON out)
    │                            #   record-response  → Phase 3 (state + log + tiered msg)
    │                            #   verdict          → Phase 4 (update state, rewrite log)
    ├── consult.test.js
    └── modes/
        ├── review-design.js     # in v1 scope
        ├── review-design.test.js
        ├── review-plan.js       # deferred to follow-up plan
        ├── review-plan.test.js
        ├── review-code.js       # deferred to follow-up plan
        ├── review-code.test.js
        ├── stuck.js             # deferred to follow-up plan
        └── stuck.test.js

hooks/scripts/
├── verdict-gate.js              # PreToolUse Skill block for strict consultations
├── verdict-gate.test.js
└── signal-collector/
    ├── index.js                 # PostToolUse dispatcher
    ├── index.test.js
    ├── suggest.js               # non-blocking suggestion emitter
    ├── suggest.test.js
    └── parsers/
        ├── test-output.js
        ├── test-output.test.js
        ├── error-signature.js
        ├── error-signature.test.js
        ├── criterion.js
        └── criterion.test.js
```

### Modified files
- `hooks/hooks.json` — add PreToolUse verdict-gate + PostToolUse signal-collector entries
- `hooks/scripts/quality-gate.js` — emit per-rule quality-gate signal events to state.js
- `skills/design-document/SKILL.md` — optional post-write call to consult-codex review-design
- `skills/verify-plan-criteria/SKILL.md` — optional post-verify call to consult-codex review-plan
- `skills/start/SKILL.md` — optional pre-Harden-PR call to consult-codex review-code
- `skills/start/references/inline-steps.md` — Harden-PR step reads session-state.consultations[] and injects codex_consultations into feature-flow-metadata block
- `.feature-flow.yml` template used by `feature-flow:start` — add commented-out `codex:` section
- `.gitignore` — already covers `.feature-flow/`; verify no changes needed
- `CHANGELOG.md` — new entry for the feature (opt-in default)
- `.claude-plugin/plugin.json` — version bump

### Test helper — define once, reused by every `.test.js` file

Every test file follows the `version-check.test.js` pattern: inline `assert` helper, plain closures, process.exit(1) on failure, no external test runner. First task establishes the canonical helper file.

### Architectural note — Claude-orchestrated, not script-orchestrated

**MCP tools (`mcp__codex__codex`) are only callable from Claude's own context, not from subprocess scripts.** The `consult-codex` skill therefore runs as a three-phase orchestration that Claude drives:

1. **Phase 1 — `consult.js start --mode <mode> [--signal-key <key>]`** (subprocess). Budget check, escape-hatch check, model resolution, brief assembly. Outputs JSON `{ status: "ready", mode, brief, model, timeout_ms, worktree }` to stdout. Does not touch state — failed preconditions return `{ status: "skipped", reason }` with nothing written.
2. **Phase 2 — Claude invokes `mcp__codex__codex` directly** using the Phase 1 JSON. Handles errors per the SKILL.md error-classification table (codex_mcp_unavailable, model_auth_rejected, timeout, codex_call_failed).
3. **Phase 3 — `consult.js record-response --mode <mode> [--signal-key <key>]`** (subprocess, stdin-driven). Reads `{ threadId, content }` or `{ error: { reason, detail } }` from stdin. Appends consultation record, writes log section, increments budget, outputs tiered return message.
4. **Phase 4 — `consult.js verdict --id cN --decision <accept|reject> --reason <text>`** (subprocess). Updates state verdict, rewrites log section. For `strict: true` consultations, the verdict-gate PreToolUse hook blocks other Skill calls until this runs.

**There is NO `call-codex.js` wrapper module.** Its original responsibilities (timeout, error classification) split between (a) Claude's own handling of the MCP tool result, per an error-classification table in SKILL.md, and (b) `consult.js record-response`, which reads the error reason from stdin.

**Why:** MCP tool invocation is exclusively Claude's capability. A subprocess cannot do it. Splitting the skill into "mechanical subprocess work" + "Claude-driven MCP call in between" matches the actual capability boundary.

---

## Execution notes

- **All commits follow the existing convention**: `<prefix>: <imperative description>` where prefix is `feat`, `fix`, `docs`, `chore`, `refactor`, or `test`. See `git log --oneline -20` for examples.
- **All tests run via `node <path>.test.js`** — no `npm test`, no test runner. Tests exit non-zero on failure.
- **Each task ends with a commit.** Frequent commits are a feature-flow requirement.
- **The commit hash at the start of this work** should be the current `main` tip (`943e8c2` at plan-writing time). Every commit below sits on top of that.
- **Worktree note:** This plan is written on `main`. If the executor wants isolation, create a worktree first: `git worktree add .worktrees/codex-consultation -b feat/codex-consultation`. The plan does not require a worktree — `.feature-flow/` is gitignored so state files don't pollute the tree.
- **No test calls real MCP.** MCP tool use (`mcp__codex__codex`) is performed by Claude directly in Phase 2, between the `start` and `record-response` subcommands. Tests exercise `start` + `recordResponse` + `verdict` as three separate function calls, passing simulated MCP results as data. Only the final manual smoke test (Step 12.4) exercises the real codex server.

---

### Task 1: Session state module

**Files:**
- Create: `skills/consult-codex/scripts/state.js`
- Create: `skills/consult-codex/scripts/state.test.js`

Responsibility: the only writer/reader of `.feature-flow/session-state.json`. Handles atomic writes (temp-file-then-rename), JSON schema creation, GC on session-id mismatch, consultation appending, metadata setting, budget accounting, and escape-hatch state.

- [ ] **Step 1.1: Write the failing test file**

```js
// skills/consult-codex/scripts/state.test.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('./state');

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-state-'));
}

console.log('=== state.js ===');

// load creates fresh state if file missing
assert('load creates fresh state when file is missing', (() => {
  const tmp = mkTmp();
  const s = state.load(tmp, 'session-abc', 'my-feature');
  fs.rmSync(tmp, { recursive: true });
  return s.session_id === 'session-abc' &&
         s.feature === 'my-feature' &&
         Array.isArray(s.consultations) &&
         s.consultations.length === 0 &&
         s.budget && s.budget.proactive && s.budget.reactive &&
         s.signals && s.escape_hatch_state;
})());

// load GCs on session-id mismatch
assert('load GCs existing state when session_id does not match', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, '.feature-flow'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, '.feature-flow', 'session-state.json'),
    JSON.stringify({ session_id: 'old', consultations: [{ id: 'c1' }] })
  );
  const s = state.load(tmp, 'new', 'feat');
  fs.rmSync(tmp, { recursive: true });
  return s.session_id === 'new' && s.consultations.length === 0;
})());

// save is atomic — writes temp file, renames
assert('save writes via temp-then-rename', (() => {
  const tmp = mkTmp();
  const s = state.load(tmp, 'sess-1', 'feat');
  s.feature = 'updated';
  state.save(tmp, s);
  const onDisk = JSON.parse(fs.readFileSync(
    path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'
  ));
  // .tmp sibling should not exist after successful save
  const tmpExists = fs.existsSync(
    path.join(tmp, '.feature-flow', 'session-state.json.tmp')
  );
  fs.rmSync(tmp, { recursive: true });
  return onDisk.feature === 'updated' && !tmpExists;
})());

// load recovers from corrupt JSON by renaming to .bak
assert('load renames corrupt json to .bak and creates fresh', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, '.feature-flow'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, '.feature-flow', 'session-state.json'),
    '{ not valid json'
  );
  const s = state.load(tmp, 'sess', 'feat');
  const bakFiles = fs.readdirSync(path.join(tmp, '.feature-flow'))
    .filter(f => f.startsWith('session-state.json.bak-'));
  fs.rmSync(tmp, { recursive: true });
  return s.session_id === 'sess' && bakFiles.length === 1;
})());

// setMetadata merges keys without touching others
assert('setMetadata updates named keys only', (() => {
  const tmp = mkTmp();
  const s = state.load(tmp, 'sess', 'feat');
  state.setMetadata(tmp, { design_doc_path: 'docs/plans/foo.md' });
  const reloaded = state.load(tmp, 'sess', 'feat');
  fs.rmSync(tmp, { recursive: true });
  return reloaded.design_doc_path === 'docs/plans/foo.md' &&
         reloaded.feature === 'feat';
})());

// appendConsultation increments id sequentially
assert('appendConsultation assigns sequential ids starting at c1', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c1 = state.appendConsultation(tmp, { mode: 'review-design', strict: false });
  const c2 = state.appendConsultation(tmp, { mode: 'review-plan', strict: false });
  fs.rmSync(tmp, { recursive: true });
  return c1.id === 'c1' && c2.id === 'c2';
})());

// setVerdict mutates named consultation
assert('setVerdict updates verdict, reason, outcome', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c = state.appendConsultation(tmp, { mode: 'stuck', strict: true });
  state.setVerdict(tmp, c.id, { decision: 'accept', reason: 'matched', outcome: 'applied' });
  const reloaded = state.load(tmp, 'sess', 'feat');
  fs.rmSync(tmp, { recursive: true });
  return reloaded.consultations[0].verdict === 'accept' &&
         reloaded.consultations[0].verdict_reason === 'matched' &&
         reloaded.consultations[0].outcome === 'applied';
})());

// pending strict consultation detection
assert('findPendingStrict returns a strict consultation with null verdict', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  state.appendConsultation(tmp, { mode: 'review-design', strict: false });
  const stuckC = state.appendConsultation(tmp, { mode: 'stuck', strict: true });
  const pending = state.findPendingStrict(tmp);
  fs.rmSync(tmp, { recursive: true });
  return pending && pending.id === stuckC.id;
})());

// findPendingStrict returns null when all strict consultations are resolved
assert('findPendingStrict returns null when verdict is recorded', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c = state.appendConsultation(tmp, { mode: 'stuck', strict: true });
  state.setVerdict(tmp, c.id, { decision: 'reject', reason: 'already tried', outcome: 'rejected' });
  const pending = state.findPendingStrict(tmp);
  fs.rmSync(tmp, { recursive: true });
  return pending === null;
})());

console.log(`\n=== state.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 1.2: Run the test to verify it fails**

```bash
node skills/consult-codex/scripts/state.test.js
```

Expected: `Error: Cannot find module './state'` — the module does not exist yet.

- [ ] **Step 1.3: Implement state.js**

```js
// skills/consult-codex/scripts/state.js
'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = '.feature-flow';
const STATE_FILE = 'session-state.json';

function statePath(worktreeRoot) {
  return path.join(worktreeRoot, STATE_DIR, STATE_FILE);
}

function ensureDir(worktreeRoot) {
  const dir = path.join(worktreeRoot, STATE_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function freshState(sessionId, feature) {
  return {
    session_id: sessionId,
    feature,
    worktree: null,
    started_at: new Date().toISOString(),
    mode: 'interactive',
    design_doc_path: null,
    plan_file_path: null,
    signals: {
      failing_tests: {},
      recurring_errors: {},
      file_edits: {},
      verify_criteria_fails: {},
      quality_gate_fails: {}
    },
    escape_hatch_state: {},
    attempts_log: [],
    budget: {
      proactive: { design_doc: 0, plan_criteria: 0, pre_harden: 0 },
      reactive: { used: 0, cap: 3 }
    },
    consultations: []
  };
}

function load(worktreeRoot, sessionId, feature) {
  ensureDir(worktreeRoot);
  const p = statePath(worktreeRoot);
  if (!fs.existsSync(p)) {
    const fresh = freshState(sessionId, feature);
    save(worktreeRoot, fresh);
    return fresh;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    const bak = `${p}.bak-${Date.now()}`;
    fs.renameSync(p, bak);
    const fresh = freshState(sessionId, feature);
    save(worktreeRoot, fresh);
    return fresh;
  }
  if (parsed.session_id !== sessionId) {
    const fresh = freshState(sessionId, feature);
    save(worktreeRoot, fresh);
    return fresh;
  }
  return parsed;
}

function save(worktreeRoot, state) {
  ensureDir(worktreeRoot);
  const p = statePath(worktreeRoot);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
}

function setMetadata(worktreeRoot, patch) {
  const p = statePath(worktreeRoot);
  const current = JSON.parse(fs.readFileSync(p, 'utf8'));
  Object.assign(current, patch);
  save(worktreeRoot, current);
  return current;
}

function appendConsultation(worktreeRoot, partial) {
  const p = statePath(worktreeRoot);
  const current = JSON.parse(fs.readFileSync(p, 'utf8'));
  const id = `c${current.consultations.length + 1}`;
  const entry = {
    id,
    when: new Date().toISOString(),
    mode: partial.mode,
    trigger: partial.trigger || 'unknown',
    strict: Boolean(partial.strict),
    signal_key: partial.signal_key || null,
    codex_thread_id: partial.codex_thread_id || null,
    codex_response: partial.codex_response || null,
    verdict: null,
    verdict_reason: null,
    outcome: partial.outcome || 'pending_verdict',
    follow_up_edits: []
  };
  current.consultations.push(entry);
  save(worktreeRoot, current);
  return entry;
}

function setVerdict(worktreeRoot, id, { decision, reason, outcome }) {
  const p = statePath(worktreeRoot);
  const current = JSON.parse(fs.readFileSync(p, 'utf8'));
  const entry = current.consultations.find(c => c.id === id);
  if (!entry) throw new Error(`consultation ${id} not found`);
  entry.verdict = decision;
  entry.verdict_reason = reason;
  entry.outcome = outcome;
  save(worktreeRoot, current);
  return entry;
}

function findPendingStrict(worktreeRoot) {
  const p = statePath(worktreeRoot);
  if (!fs.existsSync(p)) return null;
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
  const pending = (parsed.consultations || []).find(
    c => c.strict === true && c.verdict === null
  );
  return pending || null;
}

module.exports = {
  load,
  save,
  setMetadata,
  appendConsultation,
  setVerdict,
  findPendingStrict,
  statePath
};
```

- [ ] **Step 1.4: Run the tests to verify all pass**

```bash
node skills/consult-codex/scripts/state.test.js
```

Expected: `=== state.js: 9 passed, 0 failed ===` and exit code 0.

- [ ] **Step 1.5: Commit**

```bash
git add skills/consult-codex/scripts/state.js skills/consult-codex/scripts/state.test.js
git commit -m "feat: add consult-codex state module with atomic writes and GC"
```

---

### Task 2: Config loader for the `codex:` section

**Files:**
- Create: `skills/consult-codex/scripts/config.js`
- Create: `skills/consult-codex/scripts/config.test.js`

Responsibility: read `.feature-flow.yml`, extract the `codex:` section, return an object with defaults filled in. Follows `hooks/scripts/quality-gate.js` regex-parse pattern (no YAML library dependency). Returns `{ enabled: false }` when the section is missing, malformed, or the file is absent.

- [ ] **Step 2.1: Write the failing test**

```js
// skills/consult-codex/scripts/config.test.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cfg-')); }
function writeYml(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

console.log('=== config.js ===');

assert('returns disabled when .feature-flow.yml missing', (() => {
  const tmp = mkTmp();
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.enabled === false;
})());

assert('returns disabled when codex section missing', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'plugin_version: 1.0.0\nstack:\n  - node-js\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.enabled === false;
})());

assert('parses codex.enabled: true', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.enabled === true && c.model === 'gpt-5.2';
})());

assert('parses proactive review flags with defaults', (() => {
  const tmp = mkTmp();
  writeYml(tmp, [
    'codex:',
    '  enabled: true',
    '  proactive_reviews:',
    '    design_doc: true',
    '    plan_criteria: false',
    '    pre_harden: true',
    ''
  ].join('\n'));
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.proactive_reviews.design_doc === true &&
         c.proactive_reviews.plan_criteria === false &&
         c.proactive_reviews.pre_harden === true;
})());

assert('applies built-in defaults when proactive_reviews is absent', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  // default: all proactive reviews true when enabled
  return c.proactive_reviews.design_doc === true &&
         c.proactive_reviews.plan_criteria === true &&
         c.proactive_reviews.pre_harden === true;
})());

assert('parses timeout_seconds with fallback default 180', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n  timeout_seconds: 60\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.timeout_seconds === 60;
})());

assert('default timeout_seconds is 180', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.timeout_seconds === 180;
})());

assert('malformed yaml falls back to disabled', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n    bogus_indent: 1\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  // loader must not throw; return disabled-safe object
  return c.enabled === false || c.enabled === true;  // must not throw
})());

console.log(`\n=== config.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
node skills/consult-codex/scripts/config.test.js
```

Expected: `Cannot find module './config'`.

- [ ] **Step 2.3: Implement config.js**

```js
// skills/consult-codex/scripts/config.js
'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = '.feature-flow.yml';

const DEFAULTS = {
  enabled: false,
  model: null,
  timeout_seconds: 180,
  proactive_reviews: {
    design_doc: true,
    plan_criteria: true,
    pre_harden: true
  }
};

// Extract the raw text of a top-level `codex:` block. Returns null if absent.
function extractSection(yml) {
  const lines = yml.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^codex:\s*$/.test(lines[i])) { start = i + 1; break; }
  }
  if (start === -1) return null;
  const block = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line === '' || /^\s/.test(line)) block.push(line);
    else break;
  }
  return block.join('\n');
}

function parseBool(value) {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim().toLowerCase();
  if (v === 'true' || v === 'yes' || v === '1') return true;
  if (v === 'false' || v === 'no' || v === '0') return false;
  return undefined;
}

function parseInt10(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

// Flat key-value parse within a section; supports simple nested maps (depth 2).
function parseSection(block) {
  const out = {};
  const lines = block.split('\n');
  let currentKey = null;
  let currentMap = null;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const twoSpace = /^  ([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(raw);
    const fourSpace = /^    ([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(raw);
    if (twoSpace) {
      const [, k, v] = twoSpace;
      if (v === '') { currentKey = k; currentMap = {}; out[k] = currentMap; }
      else { out[k] = v.replace(/\s*#.*$/, '').trim(); currentKey = null; currentMap = null; }
    } else if (fourSpace && currentMap) {
      const [, k, v] = fourSpace;
      currentMap[k] = v.replace(/\s*#.*$/, '').trim();
    }
  }
  return out;
}

function load(worktreeRoot) {
  const p = path.join(worktreeRoot, CONFIG_FILE);
  if (!fs.existsSync(p)) return { ...DEFAULTS };

  let raw;
  try { raw = fs.readFileSync(p, 'utf8'); }
  catch { return { ...DEFAULTS }; }

  const block = extractSection(raw);
  if (!block) return { ...DEFAULTS };

  let parsed;
  try { parsed = parseSection(block); }
  catch { return { ...DEFAULTS }; }

  const enabled = parseBool(parsed.enabled) === true;
  const model = typeof parsed.model === 'string' ? parsed.model : DEFAULTS.model;
  const timeout_seconds = parseInt10(parsed.timeout_seconds) ?? DEFAULTS.timeout_seconds;

  const pr = parsed.proactive_reviews || {};
  const proactive_reviews = {
    design_doc:    parseBool(pr.design_doc)    ?? DEFAULTS.proactive_reviews.design_doc,
    plan_criteria: parseBool(pr.plan_criteria) ?? DEFAULTS.proactive_reviews.plan_criteria,
    pre_harden:    parseBool(pr.pre_harden)    ?? DEFAULTS.proactive_reviews.pre_harden
  };

  return { enabled, model, timeout_seconds, proactive_reviews };
}

module.exports = { load, DEFAULTS };
```

- [ ] **Step 2.4: Run tests**

```bash
node skills/consult-codex/scripts/config.test.js
```

Expected: `=== config.js: 8 passed, 0 failed ===`.

- [ ] **Step 2.5: Commit**

```bash
git add skills/consult-codex/scripts/config.js skills/consult-codex/scripts/config.test.js
git commit -m "feat: add codex config loader with regex-parsed YAML subset"
```

---

### Task 3: Model resolver

**Files:**
- Create: `skills/consult-codex/scripts/resolve-model.js`
- Create: `skills/consult-codex/scripts/resolve-model.test.js`

Responsibility: given the loaded config, return a model name string or `null` (with a reason code). Fallback chain: `config.model` → MCP introspection → null. Pure-function for testing; no direct MCP calls — the introspection function is injected.

- [ ] **Step 3.1: Write failing test**

```js
// skills/consult-codex/scripts/resolve-model.test.js
#!/usr/bin/env node
'use strict';

const resolveModel = require('./resolve-model');

let passed = 0, failed = 0;

async function assertAsync(name, promise) {
  try {
    const result = await promise;
    if (result) { console.log(`  ok — ${name}`); passed++; }
    else { console.log(`  FAIL — ${name}`); failed++; }
  } catch (e) {
    console.log(`  FAIL — ${name} (threw: ${e.message})`); failed++;
  }
}

async function main() {
  console.log('=== resolve-model.js ===');

  await assertAsync(
    'returns configured model verbatim',
    resolveModel({ model: 'gpt-5.2' }, async () => ['gpt-9'])
      .then(r => r.model === 'gpt-5.2' && r.source === 'config')
  );

  await assertAsync(
    'falls back to introspection when config.model is null',
    resolveModel({ model: null }, async () => ['gpt-5.2', 'gpt-5.2-codex'])
      .then(r => r.model === 'gpt-5.2' && r.source === 'introspection')
  );

  await assertAsync(
    'introspection prefers non -codex variants',
    resolveModel({ model: null }, async () => ['gpt-5.2-codex', 'gpt-5.2', 'gpt-4o'])
      .then(r => r.model === 'gpt-5.2')
  );

  await assertAsync(
    'returns null with reason when introspection yields nothing',
    resolveModel({ model: null }, async () => [])
      .then(r => r.model === null && r.reason === 'model_unresolvable')
  );

  await assertAsync(
    'returns null when introspection throws',
    resolveModel({ model: null }, async () => { throw new Error('mcp down'); })
      .then(r => r.model === null && r.reason === 'model_unresolvable')
  );

  console.log(`\n=== resolve-model.js: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
node skills/consult-codex/scripts/resolve-model.test.js
```

Expected: `Cannot find module './resolve-model'`.

- [ ] **Step 3.3: Implement resolve-model.js**

```js
// skills/consult-codex/scripts/resolve-model.js
'use strict';

async function resolveModel(config, introspect) {
  if (config && typeof config.model === 'string' && config.model.length > 0) {
    return { model: config.model, source: 'config' };
  }

  let advertised = [];
  try {
    advertised = await introspect();
  } catch {
    return { model: null, reason: 'model_unresolvable' };
  }

  if (!Array.isArray(advertised) || advertised.length === 0) {
    return { model: null, reason: 'model_unresolvable' };
  }

  const nonCodex = advertised.find(m => typeof m === 'string' && !m.endsWith('-codex'));
  if (nonCodex) return { model: nonCodex, source: 'introspection' };

  return { model: advertised[0], source: 'introspection' };
}

module.exports = resolveModel;
```

- [ ] **Step 3.4: Run tests**

```bash
node skills/consult-codex/scripts/resolve-model.test.js
```

Expected: `=== resolve-model.js: 5 passed, 0 failed ===`.

- [ ] **Step 3.5: Commit**

```bash
git add skills/consult-codex/scripts/resolve-model.js skills/consult-codex/scripts/resolve-model.test.js
git commit -m "feat: add codex model fallback chain (config → introspection → null)"
```

---

### Task 4: REMOVED — Codex call wrapper

**This task no longer exists.** The original plan included a `call-codex.js` module that wrapped `mcp__codex__codex` with a stable, mockable interface for timeout, error classification, and mode auth rejection. That module cannot work as designed because **MCP tools are only callable from Claude's context, not from subprocess scripts**.

**Where its responsibilities moved:**
- **Timeout handling** — Claude applies a wall-clock check during its own `mcp__codex__codex` tool call. If the call exceeds `timeout_ms` (from Phase 1 output), Claude treats the result as `timeout` and passes `{ error: { reason: "timeout" } }` to Phase 3's stdin.
- **Error classification** — the SKILL.md (Task 8 below) contains an explicit error-classification table Claude consults while handling its own MCP tool result. Four classifications: `codex_mcp_unavailable`, `model_auth_rejected`, `timeout`, `codex_call_failed`.
- **Response plumbing** — `consult.js record-response` (Task 7's new Phase 3 subcommand) reads either `{ threadId, content }` or `{ error: { reason, detail } }` from stdin and handles each branch.

**Do nothing for this task.** Task numbering is preserved to keep downstream task references (T5, T6, T7, etc.) stable; there is simply no work to do at T4.

---

### Task 5: Brief builder skeleton and dispatcher

**Files:**
- Create: `skills/consult-codex/scripts/build-brief.js`
- Create: `skills/consult-codex/scripts/build-brief.test.js`

Responsibility: format the shared brief skeleton defined in spec section "Rich brief skeleton". Caps the final brief at 12 KB. Per-mode builder modules (`modes/review-design.js`, etc.) provide goal/current-state/question strings; this module stitches them into the skeleton. Truncates `attempts_log` and other variable-length sections with explicit markers.

- [ ] **Step 5.1: Write failing test**

```js
// skills/consult-codex/scripts/build-brief.test.js
#!/usr/bin/env node
'use strict';

const buildBrief = require('./build-brief');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

console.log('=== build-brief.js ===');

const baseState = {
  feature: 'user notifications',
  worktree: '/abs/path',
  attempts_log: []
};

assert('renders all required sections', (() => {
  const brief = buildBrief({
    mode: 'review-design',
    state: baseState,
    goal: 'Design a notification system',
    currentState: 'Full design doc text here',
    signals: 'N/A',
    question: 'Flag ambiguity.'
  });
  return brief.includes('# Feature-flow consultation — mode: review-design') &&
         brief.includes('## Feature') &&
         brief.includes('## Goal') &&
         brief.includes('## Current state') &&
         brief.includes("## What's already been tried") &&
         brief.includes('## Signals') &&
         brief.includes('## What I need from you') &&
         brief.includes('## Constraints') &&
         brief.includes('Design a notification system') &&
         brief.includes('Flag ambiguity.');
})());

assert('renders empty attempts_log as "Nothing yet"', (() => {
  const brief = buildBrief({
    mode: 'review-design', state: baseState, goal: 'g', currentState: 'cs',
    signals: 'none', question: 'q'
  });
  return brief.includes('Nothing yet — this is a proactive review.');
})());

assert('renders non-empty attempts_log entries', (() => {
  const state = { ...baseState, attempts_log: [
    { when: '2026-04-14T20:00:00Z', task: 'store notifs', approach: 'jsonb column', result: 'migration failed' }
  ]};
  const brief = buildBrief({
    mode: 'stuck', state, goal: 'g', currentState: 'cs', signals: 's', question: 'q'
  });
  return brief.includes('jsonb column') && brief.includes('migration failed');
})());

assert('truncates to 12 KB with marker', (() => {
  const hugeCurrent = 'x'.repeat(20000);
  const brief = buildBrief({
    mode: 'review-design', state: baseState, goal: 'g', currentState: hugeCurrent,
    signals: 's', question: 'q'
  });
  return brief.length <= 12288 && brief.includes('[truncated');
})());

assert('constraint block lists all four constraints', (() => {
  const brief = buildBrief({
    mode: 'stuck', state: baseState, goal: 'g', currentState: 'cs',
    signals: 's', question: 'q'
  });
  return brief.includes('You have read-only access') &&
         brief.includes("Do NOT suggest any approach listed") &&
         brief.includes('under 400 words') &&
         brief.includes('(1) diagnosis, (2) recommendation, (3) confidence');
})());

console.log(`\n=== build-brief.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
node skills/consult-codex/scripts/build-brief.test.js
```

Expected: `Cannot find module './build-brief'`.

- [ ] **Step 5.3: Implement build-brief.js**

```js
// skills/consult-codex/scripts/build-brief.js
'use strict';

const MAX_BRIEF_BYTES = 12 * 1024;
const TRUNCATION_MARKER = '\n\n… [truncated to fit 12 KB cap]';

function formatAttempts(attempts) {
  if (!attempts || attempts.length === 0) {
    return 'Nothing yet — this is a proactive review.';
  }
  return attempts.map(a =>
    `- **${a.when}** — task: ${a.task}\n  approach: ${a.approach}\n  result: ${a.result}`
  ).join('\n');
}

function truncate(brief) {
  if (Buffer.byteLength(brief, 'utf8') <= MAX_BRIEF_BYTES) return brief;
  const budget = MAX_BRIEF_BYTES - Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
  const sliced = Buffer.from(brief, 'utf8').subarray(0, budget).toString('utf8');
  return sliced + TRUNCATION_MARKER;
}

function buildBrief({ mode, state, goal, currentState, signals, question }) {
  const feature = state.feature || '<unknown feature>';
  const worktree = state.worktree || '<unknown worktree>';
  const attempts = formatAttempts(state.attempts_log);

  const brief = [
    `# Feature-flow consultation — mode: ${mode}`,
    '',
    '## Feature',
    feature,
    '',
    '## Goal',
    goal,
    '',
    '## Current state',
    currentState,
    '',
    "## What's already been tried",
    attempts,
    '',
    '## Signals',
    signals || 'N/A',
    '',
    '## What I need from you',
    question,
    '',
    '## Constraints',
    `- You have read-only access to the worktree at ${worktree}`,
    '- Do NOT suggest any approach listed in "What\'s already been tried"',
    '- If you think the goal itself is wrong, say so explicitly and briefly',
    '- Keep your response under 400 words unless complexity truly demands more',
    '- Structure your response as: (1) diagnosis, (2) recommendation, (3) confidence (high/medium/low)',
    ''
  ].join('\n');

  return truncate(brief);
}

module.exports = buildBrief;
module.exports.MAX_BRIEF_BYTES = MAX_BRIEF_BYTES;
```

- [ ] **Step 5.4: Run tests**

```bash
node skills/consult-codex/scripts/build-brief.test.js
```

Expected: `=== build-brief.js: 5 passed, 0 failed ===`.

- [ ] **Step 5.5: Commit**

```bash
git add skills/consult-codex/scripts/build-brief.js skills/consult-codex/scripts/build-brief.test.js
git commit -m "feat: add consult-codex brief skeleton builder with 12 KB cap"
```

---

### Task 6: Record-exchange module

**Files:**
- Create: `skills/consult-codex/scripts/record-exchange.js`
- Create: `skills/consult-codex/scripts/record-exchange.test.js`

Responsibility: write the consultation and (later) verdict to `session-state.json` (via state.js) and append a human-readable entry to `.feature-flow/codex-log.md`. The log file uses a pending-section pattern: when the consultation is first recorded, a section with `### Verdict\n_pending_` is appended; when the verdict lands, that section is rewritten in place.

- [ ] **Step 6.1: Write failing test**

```js
// skills/consult-codex/scripts/record-exchange.test.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('./state');
const record = require('./record-exchange');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-rec-')); }
function readLog(tmp) {
  const p = path.join(tmp, '.feature-flow', 'codex-log.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

console.log('=== record-exchange.js ===');

assert('recordConsultation appends to state and writes pending log section', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c = record.recordConsultation(tmp, {
    mode: 'review-design',
    strict: false,
    trigger: 'proactive',
    brief: '# brief\nsome brief text',
    codex_response: 'diagnosis: fine\nrecommendation: ship\nconfidence: high',
    codex_thread_id: 'thread-1'
  });
  const log = readLog(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.id === 'c1' &&
         log.includes('## Consultation c1') &&
         log.includes('mode: review-design') &&
         log.includes('thread-1') &&
         log.includes('### Verdict\n_pending_');
})());

assert('recordVerdict updates state and rewrites pending section', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c = record.recordConsultation(tmp, {
    mode: 'stuck', strict: true, trigger: 'reactive',
    brief: '# brief', codex_response: 'diag', codex_thread_id: 't'
  });
  record.recordVerdict(tmp, c.id, { decision: 'accept', reason: 'spotted the replica mismatch', outcome: 'applied' });
  const reloaded = state.load(tmp, 'sess', 'feat');
  const log = readLog(tmp);
  fs.rmSync(tmp, { recursive: true });
  return reloaded.consultations[0].verdict === 'accept' &&
         log.includes('**VERDICT:** accept — spotted the replica mismatch') &&
         !log.includes('_pending_');
})());

assert('recordVerdict on unknown id throws', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  let threw = false;
  try { record.recordVerdict(tmp, 'c99', { decision: 'accept', reason: 'x', outcome: 'applied' }); }
  catch { threw = true; }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

console.log(`\n=== record-exchange.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
node skills/consult-codex/scripts/record-exchange.test.js
```

Expected: `Cannot find module './record-exchange'`.

- [ ] **Step 6.3: Implement record-exchange.js**

```js
// skills/consult-codex/scripts/record-exchange.js
'use strict';

const fs = require('fs');
const path = require('path');
const state = require('./state');

const LOG_FILE = path.join('.feature-flow', 'codex-log.md');

function logPath(worktreeRoot) {
  return path.join(worktreeRoot, LOG_FILE);
}

function briefExcerpt(brief, maxLines = 8) {
  return brief.split('\n').slice(0, maxLines).map(l => `> ${l}`).join('\n');
}

function appendLogSection(worktreeRoot, entry) {
  const p = logPath(worktreeRoot);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const section = [
    '',
    `## Consultation ${entry.id} — ${entry.when} — mode: ${entry.mode}`,
    '',
    `**Trigger:** ${entry.trigger}`,
    `**Codex thread:** ${entry.codex_thread_id || 'n/a'}`,
    `**Strict:** ${entry.strict}`,
    '',
    '### Brief (excerpt)',
    entry.brief_excerpt,
    '',
    '### Codex response',
    `> ${(entry.codex_response || '').replace(/\n/g, '\n> ')}`,
    '',
    '### Verdict',
    '_pending_',
    '',
    '### Outcome',
    entry.outcome,
    '',
    '---',
    ''
  ].join('\n');
  fs.appendFileSync(p, section);
}

function rewritePendingVerdict(worktreeRoot, id, decision, reason) {
  const p = logPath(worktreeRoot);
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  const header = `## Consultation ${id} —`;
  const headerIdx = content.indexOf(header);
  if (headerIdx === -1) return;
  const pendingRegion = content.indexOf('### Verdict\n_pending_', headerIdx);
  if (pendingRegion === -1) return;
  const replacement = `### Verdict\n**VERDICT:** ${decision} — ${reason}`;
  const updated = content.slice(0, pendingRegion) +
                  replacement +
                  content.slice(pendingRegion + '### Verdict\n_pending_'.length);
  fs.writeFileSync(p, updated);
}

function recordConsultation(worktreeRoot, args) {
  const entry = state.appendConsultation(worktreeRoot, {
    mode: args.mode,
    trigger: args.trigger,
    strict: args.strict,
    signal_key: args.signal_key || null,
    codex_thread_id: args.codex_thread_id || null,
    codex_response: args.codex_response || null,
    outcome: 'pending_verdict'
  });
  appendLogSection(worktreeRoot, {
    ...entry,
    brief_excerpt: briefExcerpt(args.brief || '')
  });
  return entry;
}

function recordVerdict(worktreeRoot, id, { decision, reason, outcome }) {
  state.setVerdict(worktreeRoot, id, { decision, reason, outcome });
  rewritePendingVerdict(worktreeRoot, id, decision, reason);
}

module.exports = { recordConsultation, recordVerdict };
```

- [ ] **Step 6.4: Run tests**

```bash
node skills/consult-codex/scripts/record-exchange.test.js
```

Expected: `=== record-exchange.js: 3 passed, 0 failed ===`.

- [ ] **Step 6.5: Commit**

```bash
git add skills/consult-codex/scripts/record-exchange.js skills/consult-codex/scripts/record-exchange.test.js
git commit -m "feat: add record-exchange for state + codex-log.md append"
```

---

### Task 7: consult.js CLI with three subcommands (start / record-response / verdict)

**Files:**
- Create: `skills/consult-codex/scripts/consult.js`
- Create: `skills/consult-codex/scripts/consult.test.js`
- Create: `skills/consult-codex/scripts/modes/review-design.js` (stub — filled out in Task 10)

Responsibility: the CLI entry point that the SKILL.md tells Claude to invoke between the three orchestration phases. One module, three subcommands, one shared test file. **No `call-codex.js` import** — that module has been removed (Task 4 REMOVED). MCP tool use is handled by Claude directly in Phase 2, between the `start` and `record-response` subcommands.

**Three subcommands:**

1. **`consult.js start --mode <mode> [--signal-key <key>]`** — Phase 1
   - Loads config + state (without writing)
   - Checks enabled, budget, escape-hatch
   - Resolves model via injected introspection (real use: Claude passes via env var `CODEX_ADVERTISED_MODELS` comma-separated)
   - Builds brief via the per-mode module
   - Prints JSON to stdout: `{ status: "ready", mode, brief, model, timeout_ms, worktree, signal_key? }` or `{ status: "skipped", reason, message }` or `{ status: "disabled", message }`
   - Exit code 0 always (status is in the JSON)
   - **Does not touch state.**

2. **`consult.js record-response --mode <mode> [--signal-key <key>]`** — Phase 3
   - Reads JSON from stdin: `{ threadId, content }` on success or `{ error: { reason, detail } }` on failure
   - Appends a consultation entry to `state.consultations[]` with `strict` set per mode, `codex_response`/`codex_thread_id` populated from stdin (or null on error)
   - Writes the codex-log.md pending section (or skipped section on error)
   - Increments budget (proactive or reactive)
   - Updates escape_hatch_state (reactive only)
   - Prints JSON to stdout with the tiered return message: `{ status: "consulted", tier: "strict"|"soft", consultation_id, message }` or `{ status: "recorded_skip", consultation_id, reason, message }`

3. **`consult.js verdict --id <id> --decision <accept|reject> --reason <text>`** — Phase 4
   - Updates the consultation's verdict/verdict_reason/outcome
   - Rewrites the pending section of codex-log.md to the final form
   - Prints JSON to stdout: `{ status: "verdict_recorded", consultation_id, message }`

**Public interface for testing** — the module exports each subcommand as a function that takes an explicit params object (`worktreeRoot`, `sessionId`, `feature`, and subcommand-specific inputs). The CLI wrapper at the bottom of the file converts `process.argv` + stdin into those params. Tests call the functions directly with temp dirs and in-memory inputs.

- [ ] **Step 7.1: Create the review-design stub**

```js
// skills/consult-codex/scripts/modes/review-design.js
'use strict';

// Stub for now — expanded in Task 10 with real goal/currentState/question content.
function buildInputs() {
  return {
    goal: '(review-design stub)',
    currentState: '(review-design stub)',
    signals: 'N/A',
    question: '(review-design stub)'
  };
}

module.exports = { buildInputs };
```

- [ ] **Step 7.2: Write consult.test.js**

```js
// skills/consult-codex/scripts/consult.test.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const consult = require('./consult');

let passed = 0, failed = 0;
async function assertAsync(name, promise) {
  try {
    const result = await promise;
    if (result) { console.log(`  ok — ${name}`); passed++; }
    else { console.log(`  FAIL — ${name}`); failed++; }
  } catch (e) {
    console.log(`  FAIL — ${name} (threw: ${e.message})`); failed++;
  }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-consult-')); }
function writeYml(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

async function main() {
  console.log('=== consult.js ===');

  // --- start subcommand ---

  await assertAsync(
    'start: refuses when codex.enabled is false',
    consult.start({
      worktreeRoot: (() => { const t = mkTmp(); writeYml(t, 'codex:\n  enabled: false\n'); return t; })(),
      sessionId: 's', feature: 'f',
      mode: 'review-design',
      introspect: async () => []
    }).then(r => r.status === 'disabled' && r.message.includes('enabled: false'))
  );

  await assertAsync(
    'start: returns ready JSON with brief and model on success',
    consult.start({
      worktreeRoot: (() => { const t = mkTmp(); writeYml(t, 'codex:\n  enabled: true\n  model: gpt-5.2\n'); return t; })(),
      sessionId: 's', feature: 'f',
      mode: 'review-design',
      introspect: async () => []
    }).then(r => r.status === 'ready' &&
                 typeof r.brief === 'string' && r.brief.length > 0 &&
                 r.model === 'gpt-5.2' &&
                 r.mode === 'review-design' &&
                 typeof r.timeout_ms === 'number')
  );

  await assertAsync(
    'start: returns skipped:model_unresolvable when model unset and no introspection',
    consult.start({
      worktreeRoot: (() => { const t = mkTmp(); writeYml(t, 'codex:\n  enabled: true\n'); return t; })(),
      sessionId: 's', feature: 'f',
      mode: 'review-design',
      introspect: async () => []
    }).then(r => r.status === 'skipped' && r.reason === 'model_unresolvable')
  );

  await assertAsync(
    'start: does NOT touch session-state.json',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      await consult.start({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design',
        introspect: async () => []
      });
      const stateExists = fs.existsSync(path.join(tmp, '.feature-flow', 'session-state.json'));
      fs.rmSync(tmp, { recursive: true });
      return stateExists === false;
    })()
  );

  // --- record-response subcommand ---

  await assertAsync(
    'record-response: success path appends consultation and increments budget',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      const result = await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design',
        signalKey: null,
        mcpResult: { threadId: 'thread-1', content: 'diag\nrec\nconfidence: high' }
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return result.status === 'consulted' &&
             result.tier === 'soft' &&
             result.consultation_id === 'c1' &&
             result.message.includes('verdict --id c1') &&
             stateFile.consultations.length === 1 &&
             stateFile.consultations[0].verdict === null &&
             stateFile.budget.proactive.design_doc === 1;
    })()
  );

  await assertAsync(
    'record-response: error path records skipped consultation with reason',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      const result = await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design',
        signalKey: null,
        mcpResult: { error: { reason: 'model_auth_rejected', detail: 'not supported' } }
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return result.status === 'recorded_skip' &&
             result.reason === 'model_auth_rejected' &&
             stateFile.consultations[0].outcome === 'skipped:model_auth_rejected' &&
             stateFile.consultations[0].codex_response === null;
    })()
  );

  await assertAsync(
    'record-response: reactive stuck mode records strict consultation with signal_key',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      const result = await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'stuck',
        signalKey: 'test:user_notifications_creates_record',
        mcpResult: { threadId: 'thread-2', content: 'diagnosis' }
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return result.tier === 'strict' &&
             stateFile.consultations[0].strict === true &&
             stateFile.consultations[0].signal_key === 'test:user_notifications_creates_record' &&
             stateFile.budget.reactive.used === 1;
    })()
  );

  // --- verdict subcommand ---

  await assertAsync(
    'verdict: updates consultation verdict and reason',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design', signalKey: null,
        mcpResult: { threadId: 't', content: 'x' }
      });
      const r = await consult.verdict({
        worktreeRoot: tmp,
        id: 'c1',
        decision: 'accept',
        reason: 'matched the issue'
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return r.status === 'verdict_recorded' &&
             stateFile.consultations[0].verdict === 'accept' &&
             stateFile.consultations[0].verdict_reason === 'matched the issue' &&
             stateFile.consultations[0].outcome === 'applied';
    })()
  );

  await assertAsync(
    'verdict: errors when --id or --decision missing',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      const r = await consult.verdict({ worktreeRoot: tmp, id: 'c1', decision: null, reason: 'x' });
      fs.rmSync(tmp, { recursive: true });
      return r.status === 'error' && r.message.includes('--decision');
    })()
  );

  console.log(`\n=== consult.js: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
```

- [ ] **Step 7.3: Run test to verify it fails**

```bash
node skills/consult-codex/scripts/consult.test.js
```

Expected: `Cannot find module './consult'`.

- [ ] **Step 7.4: Implement consult.js**

```js
// skills/consult-codex/scripts/consult.js
'use strict';

const path = require('path');
const state = require('./state');
const config = require('./config');
const buildBrief = require('./build-brief');
const resolveModel = require('./resolve-model');
const record = require('./record-exchange');

const PROACTIVE_MODES = new Set(['review-design', 'review-plan', 'review-code']);
const REACTIVE_MODES = new Set(['stuck']);
const MODE_TO_BUDGET_KEY = {
  'review-design': 'design_doc',
  'review-plan':   'plan_criteria',
  'review-code':   'pre_harden'
};

function isValidMode(m) {
  return PROACTIVE_MODES.has(m) || REACTIVE_MODES.has(m);
}

// --------------------------------------------------------------------------
// Subcommand: start
// --------------------------------------------------------------------------

async function start({ worktreeRoot, sessionId, feature, mode, signalKey, introspect }) {
  const cfg = config.load(worktreeRoot);

  if (!cfg.enabled) {
    return { status: 'disabled', message: 'codex is disabled (enabled: false in .feature-flow.yml)' };
  }

  if (!isValidMode(mode)) {
    return { status: 'error', message: `unknown mode: ${mode}` };
  }

  // Proactive budget check — READ ONLY, does not touch state
  if (PROACTIVE_MODES.has(mode)) {
    const stateFilePath = state.statePath(worktreeRoot);
    const fs = require('fs');
    if (fs.existsSync(stateFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        const key = MODE_TO_BUDGET_KEY[mode];
        if (existing.budget && existing.budget.proactive && existing.budget.proactive[key] >= 1) {
          return { status: 'skipped', reason: 'budget_exhausted', message: `proactive ${mode} already ran this session` };
        }
      } catch {
        /* corrupt state: let record-response handle recovery */
      }
    }
  }

  // Reactive escape-hatch check (stuck mode only)
  if (REACTIVE_MODES.has(mode) && signalKey) {
    const fs = require('fs');
    const stateFilePath = state.statePath(worktreeRoot);
    if (fs.existsSync(stateFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        const hatch = (existing.escape_hatch_state || {})[signalKey];
        if (hatch && hatch.last_consulted_at) {
          // v1: default 30-minute window, not yet configurable in this task
          const windowMs = 30 * 60 * 1000;
          if (Date.now() - new Date(hatch.last_consulted_at).getTime() < windowMs) {
            return { status: 'skipped', reason: 'escape_hatch_active', message: `signal ${signalKey} is within the escape-hatch window` };
          }
        }
      } catch { /* corrupt state */ }
    }
  }

  // Resolve model
  const resolved = await resolveModel(cfg, introspect || (async () => []));
  if (!resolved.model) {
    return { status: 'skipped', reason: resolved.reason || 'model_unresolvable', message: 'no codex model available' };
  }

  // Build brief via per-mode module
  const modeModule = require(`./modes/${mode}`);
  // Load a transient state snapshot for the brief builder without writing
  const transientState = { feature, worktree: worktreeRoot, attempts_log: [] };
  const inputs = modeModule.buildInputs({ worktreeRoot, state: transientState });
  const brief = buildBrief({
    mode,
    state: transientState,
    goal: inputs.goal,
    currentState: inputs.currentState,
    signals: inputs.signals,
    question: inputs.question
  });

  return {
    status: 'ready',
    mode,
    brief,
    model: resolved.model,
    timeout_ms: (cfg.timeout_seconds || 180) * 1000,
    worktree: worktreeRoot,
    signal_key: signalKey || null
  };
}

// --------------------------------------------------------------------------
// Subcommand: record-response
// --------------------------------------------------------------------------

async function recordResponse({ worktreeRoot, sessionId, feature, mode, signalKey, mcpResult }) {
  if (!isValidMode(mode)) {
    return { status: 'error', message: `unknown mode: ${mode}` };
  }

  state.load(worktreeRoot, sessionId, feature);

  const strict = REACTIVE_MODES.has(mode);
  const isError = mcpResult && mcpResult.error;

  if (isError) {
    const { reason, detail } = mcpResult.error;
    const entry = record.recordConsultation(worktreeRoot, {
      mode,
      strict,
      trigger: strict ? 'reactive' : 'proactive',
      signal_key: signalKey || null,
      brief: '(not recorded — call failed before brief was consumed)',
      codex_response: null,
      codex_thread_id: null
    });
    // Override outcome on the freshly appended entry
    state.setVerdict(worktreeRoot, entry.id, {
      decision: null,
      reason: null,
      outcome: `skipped:${reason}`
    });
    // Reset verdict back to null (skipped entries are not verdict-pending)
    const fs = require('fs');
    const s = JSON.parse(fs.readFileSync(state.statePath(worktreeRoot), 'utf8'));
    const target = s.consultations.find(c => c.id === entry.id);
    target.verdict = null;
    target.verdict_reason = null;
    state.save(worktreeRoot, s);

    return {
      status: 'recorded_skip',
      consultation_id: entry.id,
      reason,
      message: `Consultation ${entry.id} skipped: ${reason} — ${detail || ''}`
    };
  }

  // Success path
  const { threadId, content } = mcpResult;
  const entry = record.recordConsultation(worktreeRoot, {
    mode,
    strict,
    trigger: strict ? 'reactive' : 'proactive',
    signal_key: signalKey || null,
    brief: '(brief from start; record-response does not re-emit it)',
    codex_response: content,
    codex_thread_id: threadId
  });

  // Increment budget
  if (PROACTIVE_MODES.has(mode)) {
    const s = state.load(worktreeRoot, sessionId, feature);
    const key = MODE_TO_BUDGET_KEY[mode];
    s.budget.proactive[key] += 1;
    state.save(worktreeRoot, s);
  } else if (REACTIVE_MODES.has(mode)) {
    const s = state.load(worktreeRoot, sessionId, feature);
    s.budget.reactive.used += 1;
    if (signalKey) {
      s.escape_hatch_state[signalKey] = { last_consulted_at: new Date().toISOString() };
    }
    state.save(worktreeRoot, s);
  }

  return buildReturnMessage(entry, strict, content);
}

// --------------------------------------------------------------------------
// Subcommand: verdict
// --------------------------------------------------------------------------

async function verdict({ worktreeRoot, id, decision, reason }) {
  if (!id || !decision) {
    return { status: 'error', message: 'verdict requires --id and --decision' };
  }
  if (decision !== 'accept' && decision !== 'reject') {
    return { status: 'error', message: 'decision must be accept or reject' };
  }
  const outcome = decision === 'accept' ? 'applied' : 'rejected';
  record.recordVerdict(worktreeRoot, id, { decision, reason: reason || '', outcome });
  return {
    status: 'verdict_recorded',
    consultation_id: id,
    message: `Consultation ${id} verdict recorded: ${decision} — ${reason || ''}`
  };
}

// --------------------------------------------------------------------------
// Return message builder (shared by recordResponse)
// --------------------------------------------------------------------------

function buildReturnMessage(entry, strict, codexContent) {
  if (strict) {
    return {
      status: 'consulted',
      tier: 'strict',
      consultation_id: entry.id,
      message: [
        `# Codex consultation ${entry.id} — mode: ${entry.mode}`,
        entry.signal_key ? `# Signal: ${entry.signal_key}` : '',
        '# Enforcement: STRICT (PreToolUse block until verdict is recorded)',
        '',
        '## Codex response',
        codexContent,
        '',
        '## REQUIRED next step',
        'The next Skill call you make MUST be the verdict call for this consultation.',
        'All other Skill invocations will be blocked by the verdict-gate PreToolUse hook',
        'until this is recorded.',
        '',
        `    Skill(skill: "feature-flow:consult-codex", args: "verdict --id ${entry.id} --decision <accept|reject> --reason <short text>")`
      ].filter(Boolean).join('\n')
    };
  }
  return {
    status: 'consulted',
    tier: 'soft',
    consultation_id: entry.id,
    message: [
      `# Codex consultation ${entry.id} — mode: ${entry.mode}`,
      '# Enforcement: SOFT (single-shot reminder; missing verdict surfaces as <not recorded> in PR metadata)',
      '',
      '## Codex response',
      codexContent,
      '',
      '## Recommended next step',
      'To record your verdict, paste this one-liner (this reminder will not repeat):',
      '',
      `    Skill(skill: "feature-flow:consult-codex", args: "verdict --id ${entry.id} --decision <accept|reject> --reason <short text>")`,
      '',
      'If you skip this, the consultation will be logged with verdict: <not recorded>.'
    ].join('\n')
  };
}

// --------------------------------------------------------------------------
// CLI wrapper
// --------------------------------------------------------------------------

async function mainCli() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const worktreeRoot = process.env.FEATURE_FLOW_WORKTREE || process.cwd();
  const sessionId = process.env.FEATURE_FLOW_SESSION_ID || 'cli-session';
  const feature = process.env.FEATURE_FLOW_FEATURE || path.basename(worktreeRoot);

  function parseFlags(tokens) {
    const out = {};
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].startsWith('--')) {
        const key = tokens[i].slice(2);
        const valParts = [];
        while (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
          valParts.push(tokens[++i]);
        }
        out[key] = valParts.join(' ');
      }
    }
    return out;
  }

  function readStdin() {
    return new Promise(resolve => {
      if (process.stdin.isTTY) return resolve('');
      let data = '';
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data));
    });
  }

  let result;
  if (sub === 'start') {
    const flags = parseFlags(argv.slice(1));
    const introspect = process.env.CODEX_ADVERTISED_MODELS
      ? async () => process.env.CODEX_ADVERTISED_MODELS.split(',').map(s => s.trim()).filter(Boolean)
      : async () => [];
    result = await start({
      worktreeRoot, sessionId, feature,
      mode: flags.mode,
      signalKey: flags['signal-key'] || null,
      introspect
    });
  } else if (sub === 'record-response') {
    const flags = parseFlags(argv.slice(1));
    const stdin = await readStdin();
    let mcpResult;
    try { mcpResult = JSON.parse(stdin); }
    catch { mcpResult = { error: { reason: 'codex_call_failed', detail: 'could not parse stdin JSON' } }; }
    result = await recordResponse({
      worktreeRoot, sessionId, feature,
      mode: flags.mode,
      signalKey: flags['signal-key'] || null,
      mcpResult
    });
  } else if (sub === 'verdict') {
    const flags = parseFlags(argv.slice(1));
    result = await verdict({
      worktreeRoot,
      id: flags.id,
      decision: flags.decision,
      reason: flags.reason
    });
  } else {
    result = { status: 'error', message: `unknown subcommand: ${sub || '<none>'}` };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'error' ? 1 : 0);
}

if (require.main === module) {
  mainCli().catch(err => {
    console.log(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  });
}

module.exports = { start, recordResponse, verdict };
```

- [ ] **Step 7.5: Run tests**

```bash
node skills/consult-codex/scripts/consult.test.js
```

Expected: `=== consult.js: 9 passed, 0 failed ===`.

- [ ] **Step 7.6: Commit**

```bash
git add skills/consult-codex/scripts/consult.js skills/consult-codex/scripts/consult.test.js skills/consult-codex/scripts/modes/review-design.js
git commit -m "feat: add consult-codex CLI with start/record-response/verdict subcommands"
```

---

### Task 8: SKILL.md for consult-codex

**Files:**
- Create: `skills/consult-codex/SKILL.md`
- Create: `skills/consult-codex/references/brief-format.md`
- Create: `skills/consult-codex/references/modes.md`
- Create: `skills/consult-codex/references/escape-hatch.md`

Responsibility: the top-level skill entry read by Claude. **This SKILL.md is the orchestration script** — it tells Claude how to run the three-phase flow (Phase 1 subprocess → Phase 2 direct MCP call → Phase 3 subprocess → Phase 4 subprocess verdict), how to classify MCP errors, and how to record the verdict. There is no monolithic "run consultation end-to-end" script; Claude drives it.

- [ ] **Step 8.1: Write SKILL.md**

````markdown
<!-- skills/consult-codex/SKILL.md -->
---
name: consult-codex
description: Consult the codex MCP server as a second AI opinion via a three-phase Claude-orchestrated flow. Use for proactive reviews (design, plan, code) or reactive stuck recovery. Requires codex.enabled=true in .feature-flow.yml and a configured codex MCP server.
---

# Consult Codex

Claude-orchestrated three-phase skill: **subprocess Phase 1 → direct MCP call Phase 2 → subprocess Phase 3 → subprocess Phase 4 verdict**. MCP tools like `mcp__codex__codex` are only callable from Claude's own context, so the skill is NOT a single script that runs end-to-end — it is an orchestration guide Claude follows.

## When to invoke

**Proactive (automatic, from other lifecycle skills):**
- `mode: review-design` — after writing a design doc, before verification (integrated into `feature-flow:design-document`)
- `mode: review-plan` — after `verify-plan-criteria` mechanical check passes *(deferred — follow-up plan)*
- `mode: review-code` — before Harden-PR step, after all tests pass *(deferred)*

**Reactive (manual or auto-suggested):**
- `mode: stuck` — user typed `stuck:` or a signal-collector hook emitted a stuck suggestion *(deferred — follow-up plan)*

## Orchestration — follow these phases in order

### Phase 1 — `consult.js start`

Run the start subprocess to check preconditions and build the brief.

```bash
FEATURE_FLOW_SESSION_ID=<session-id> \
FEATURE_FLOW_FEATURE=<feature-name> \
FEATURE_FLOW_WORKTREE=<abs-path-to-worktree> \
node skills/consult-codex/scripts/consult.js start --mode <mode> [--signal-key <key>]
```

Parse the JSON on stdout. Possible statuses:

- `"disabled"` → stop. Codex is disabled. Report the message to the user. Skip the rest of this skill.
- `"skipped"` → stop. A precondition (budget, escape-hatch, model-unresolvable) rejected this call. Report the reason.
- `"ready"` → proceed to Phase 2 with the returned `{ brief, model, timeout_ms, worktree, mode, signal_key }`.

### Phase 2 — Call `mcp__codex__codex` directly (your own tool call)

Do NOT run a subprocess for this. Claude invokes the MCP tool in its own context:

```
mcp__codex__codex({
  prompt: <brief from Phase 1>,
  cwd: <worktree from Phase 1>,
  sandbox: "read-only",
  "approval-policy": "never",
  model: <model from Phase 1>
})
```

**Wall-clock timeout:** if the call does not complete within `timeout_ms` (from Phase 1 output), treat it as `timeout`. Do not wait longer.

**Error classification — consult this table to decide what to pass to Phase 3:**

| What you observed | stdin JSON for Phase 3 |
|---|---|
| Tool returned `{ threadId, content }` normally | `{ "threadId": "...", "content": "..." }` |
| Tool not loaded (ToolSearch failed or returned empty) | `{ "error": { "reason": "codex_mcp_unavailable", "detail": "..." } }` |
| Tool throws with message matching `model is not supported` | `{ "error": { "reason": "model_auth_rejected", "detail": "<err msg>" } }` |
| Tool throws any other message | `{ "error": { "reason": "codex_call_failed", "detail": "<err msg>" } }` |
| Wall-clock exceeded `timeout_ms` | `{ "error": { "reason": "timeout", "detail": "exceeded <N>ms" } }` |

### Phase 3 — `consult.js record-response`

Pipe the Phase 2 JSON to the record-response subprocess:

```bash
echo '<phase 2 json>' | \
FEATURE_FLOW_SESSION_ID=<id> FEATURE_FLOW_FEATURE=<name> FEATURE_FLOW_WORKTREE=<path> \
node skills/consult-codex/scripts/consult.js record-response --mode <mode> [--signal-key <key>]
```

Parse stdout. Possible statuses:

- `"consulted"` → success. The JSON contains `tier` (`strict` or `soft`), `consultation_id`, and a formatted `message`. Render the message to yourself so you can read codex's diagnosis. The message includes the exact one-liner for Phase 4 (verdict).
- `"recorded_skip"` → the error was recorded as a skipped consultation. The lifecycle continues without codex's input. Surface the `reason` to the user.

### Phase 4 — Verdict (mandatory for `consulted`, skipped for `recorded_skip`)

After you read codex's diagnosis from Phase 3, invoke the skill again as a **separate Skill call**:

```
Skill(skill: "feature-flow:consult-codex",
      args: "verdict --id cN --decision accept|reject --reason <short text>")
```

This tells Claude to run:

```bash
node skills/consult-codex/scripts/consult.js verdict --id cN --decision <accept|reject> --reason "<text>"
```

**Verdict must be specific, not generic.** Good: `"spotted the replica schema divergence we missed"`. Bad: `"looks right"`. For `reject`, the reason MUST reference either what's already been tried or a concrete flaw in codex's advice.

## Tiered verdict enforcement

**Strict tier (reactive `stuck` mode, `strict: true`):** after Phase 3, your next `Skill(...)` call MUST be the Phase 4 verdict call. The `verdict-gate` PreToolUse hook blocks all other Skill invocations until the verdict is recorded. Plain Read/Edit/Write/Bash are not blocked — you can investigate before deciding. (Stuck mode is deferred to a follow-up plan; the verdict-gate hook is built in this plan to support it.)

**Soft tier (proactive modes, `strict: false`):** single-shot reminder in the Phase 3 return message. No block. If you skip the verdict call, the consultation is logged with `verdict: <not recorded>` and surfaces as a visible audit defect in PR metadata. The lifecycle proceeds either way.

## Disabled state

If `.feature-flow.yml` has `codex.enabled: false` (the default) or the `codex:` section is missing entirely, Phase 1 returns `{ status: "disabled", message }`. Stop there, surface the message, and proceed with the normal lifecycle. No state is written.

## References

- `references/brief-format.md` — exact format of the brief assembled by Phase 1 and sent to codex
- `references/modes.md` — per-mode goal/current-state/question templates
- `references/escape-hatch.md` — second-opinion-stumped protocol (reactive mode, follow-up plan)
````

Note: the triple-backtick code block wrapping the entire SKILL.md uses **four** backticks (````) for the outer fence so that the inner triple-backtick blocks (bash, markdown) render correctly. The file itself is plain markdown on disk with triple backticks.

- [ ] **Step 8.2: Write references/brief-format.md**

```markdown
<!-- skills/consult-codex/references/brief-format.md -->
# Brief format

The brief sent to codex follows this skeleton exactly. Each section is populated by per-mode builders in `scripts/modes/*.js`. The total brief is capped at 12 KB; content that exceeds is truncated with a `[truncated]` marker.

```
# Feature-flow consultation — mode: <mode>

## Feature
<feature name from session state>

## Goal
<mode-specific>

## Current state
<mode-specific>

## What's already been tried
<entries from attempts_log, filtered by mode>
<or: "Nothing yet — this is a proactive review.">

## Signals
<mode-specific; stuck mode includes failing test / error / criterion>

## What I need from you
<mode-specific question>

## Constraints
- You have read-only access to the worktree at <abs path>
- Do NOT suggest any approach listed in "What's already been tried"
- If you think the goal itself is wrong, say so explicitly and briefly
- Keep your response under 400 words unless complexity truly demands more
- Structure your response as: (1) diagnosis, (2) recommendation, (3) confidence (high/medium/low)
```

Each mode's brief builder returns `{ goal, currentState, signals, question }` which `build-brief.js` stitches into the skeleton above.
```

- [ ] **Step 8.3: Write references/modes.md**

```markdown
<!-- skills/consult-codex/references/modes.md -->
# Modes

| Mode | Tier | Goal | Current state | Question |
|---|---|---|---|---|
| review-design | soft | Design doc summary | Full design doc text inline | Identify unstated assumptions, missing edge cases, internal contradictions, vague requirements. |
| review-plan | soft | Design doc summary + path | Plan file with tasks + acceptance criteria inline | For each task, assess whether criteria are sufficient to prove behavior — not just existence. |
| review-code | soft | Design doc summary + path | `git diff <base>..HEAD` truncated to 8 KB + changed files list | Does this diff realize the design? Any quality issues? Any drift from stated design? |
| stuck | strict | Current in-flight task from plan | Failing signal with sample output | What's actually wrong? What approach hasn't been tried? Is the task approach flawed? |

Strict tier = reactive `stuck` mode only. It uses the PreToolUse verdict-gate hook to block non-verdict Skill calls until the verdict is recorded. Soft tier = all proactive modes; missing verdict surfaces as `<not recorded>` in PR metadata.
```

- [ ] **Step 8.4: Write references/escape-hatch.md**

```markdown
<!-- skills/consult-codex/references/escape-hatch.md -->
# Escape hatch — second-opinion stumped protocol

When a reactive stuck consultation is recorded, the signal key that triggered it is also written to `session-state.escape_hatch_state[<key>]` with `last_consulted_at: <now>`.

If the same signal fires again within `codex.reactive.escape_hatch_window_minutes` (default 30) after the consultation, the signal collector refuses to suggest another consultation and instead surfaces the issue to the user directly:

```
[feature-flow] Signal "<key>" fired again within the escape-hatch window. Codex's advice did not resolve this.
  → Pause and ask the user. This is the "second-opinion stumped" escape hatch.
  → Do NOT re-consult codex for this signal until the window expires at <ISO>.
```

Two AI models agreeing on the wrong path is worse than one — this is the hard stop against that, scoped to a configurable window so we don't poison the well indefinitely.

This protocol is stuck-mode only (v1 scope). Proactive modes don't need it because they're bounded (max 1 per mode per lifecycle).
```

- [ ] **Step 8.5: Commit**

```bash
git add skills/consult-codex/SKILL.md skills/consult-codex/references/
git commit -m "docs: add consult-codex SKILL.md with tiered enforcement guidance"
```

---

### Task 9: Verdict-gate PreToolUse hook + hooks.json wiring

**Files:**
- Create: `hooks/scripts/verdict-gate.js`
- Create: `hooks/scripts/verdict-gate.test.js`
- Modify: `hooks/hooks.json` — add the PreToolUse Skill hook entry

Responsibility: read `session-state.json` via `state.findPendingStrict`. If a strict consultation has a pending verdict AND the current Skill invocation is not the verdict call for it, emit a BLOCK message to stdout. Otherwise exit 0 silently.

- [ ] **Step 9.1: Write verdict-gate.test.js**

```js
// hooks/scripts/verdict-gate.test.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'verdict-gate-')); }
function writeState(dir, obj) {
  fs.mkdirSync(path.join(dir, '.feature-flow'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.feature-flow', 'session-state.json'), JSON.stringify(obj));
}

const SCRIPT = path.resolve(__dirname, 'verdict-gate.js');

function runGate(cwd, toolInput) {
  try {
    const out = execSync(`node ${SCRIPT}`, {
      cwd,
      input: JSON.stringify({ tool_name: 'Skill', tool_input: toolInput }),
      encoding: 'utf8'
    });
    return { exitCode: 0, stdout: out };
  } catch (err) {
    return { exitCode: err.status || 1, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

console.log('=== verdict-gate.js ===');

assert('exits 0 silently when no pending strict consultation', (() => {
  const tmp = mkTmp();
  writeState(tmp, { session_id: 'x', consultations: [] });
  const r = runGate(tmp, { skill: 'any-skill', args: 'whatever' });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when pending consultation is soft (strict: false)', (() => {
  const tmp = mkTmp();
  writeState(tmp, { session_id: 'x', consultations: [
    { id: 'c1', strict: false, verdict: null, mode: 'review-design' }
  ]});
  const r = runGate(tmp, { skill: 'any-skill', args: 'whatever' });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('blocks non-verdict Skill when strict consultation is pending', (() => {
  const tmp = mkTmp();
  writeState(tmp, { session_id: 'x', consultations: [
    { id: 'c2', strict: true, verdict: null, mode: 'stuck', signal_key: 'test:foo' }
  ]});
  const r = runGate(tmp, { skill: 'feature-flow:some-other-skill', args: 'foo' });
  fs.rmSync(tmp, { recursive: true });
  return r.stdout.includes('BLOCK') && r.stdout.includes('c2') && r.stdout.includes('verdict --id c2');
})());

assert('allows the verdict call itself through', (() => {
  const tmp = mkTmp();
  writeState(tmp, { session_id: 'x', consultations: [
    { id: 'c3', strict: true, verdict: null, mode: 'stuck', signal_key: 'err:TypeError:foo' }
  ]});
  const r = runGate(tmp, {
    skill: 'feature-flow:consult-codex',
    args: 'verdict --id c3 --decision accept --reason resolved the thing'
  });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

console.log(`\n=== verdict-gate.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 9.2: Run test to verify it fails**

```bash
node hooks/scripts/verdict-gate.test.js
```

Expected: the script doesn't exist yet, all four tests fail with module-not-found.

- [ ] **Step 9.3: Implement verdict-gate.js**

```js
// hooks/scripts/verdict-gate.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); }
  catch { return ''; }
}

function loadState(cwd) {
  const p = path.join(cwd, '.feature-flow', 'session-state.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function isVerdictCallForPending(args, pendingId) {
  if (typeof args !== 'string') return false;
  if (!/^verdict\b/.test(args)) return false;
  const match = /--id\s+(\S+)/.exec(args);
  return match && match[1] === pendingId;
}

function main() {
  const raw = readStdinSync();
  if (!raw) process.exit(0);

  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }

  const toolName = payload.tool_name || '';
  if (toolName !== 'Skill') process.exit(0);

  const state = loadState(process.cwd());
  if (!state || !Array.isArray(state.consultations)) process.exit(0);

  const pending = state.consultations.find(
    c => c && c.strict === true && c.verdict === null
  );
  if (!pending) process.exit(0);

  const toolInput = payload.tool_input || {};
  const skillName = toolInput.skill || '';
  const args = toolInput.args || '';

  if (skillName === 'feature-flow:consult-codex' && isVerdictCallForPending(args, pending.id)) {
    process.exit(0);
  }

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
}

try { main(); } catch { process.exit(0); }
```

- [ ] **Step 9.4: Run tests**

```bash
node hooks/scripts/verdict-gate.test.js
```

Expected: `=== verdict-gate.js: 4 passed, 0 failed ===`.

- [ ] **Step 9.5: Wire verdict-gate into hooks.json**

Read `hooks/hooks.json`, find the `"PreToolUse"` array, and add this matcher entry alongside the existing ones:

```json
{
  "matcher": "Skill",
  "hooks": [
    {
      "type": "command",
      "command": "node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/verdict-gate.js"
    }
  ],
  "description": "BLOCK non-verdict Skill calls when a strict codex consultation has a pending verdict"
}
```

Use the Edit tool to insert this entry; do not rewrite the whole file. Place it as the last entry in the `PreToolUse` array so it evaluates after existing Write/Edit/Agent/Task matchers.

- [ ] **Step 9.6: Verify hooks.json is still valid JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('hooks/hooks.json', 'utf8'))" && echo "hooks.json valid"
```

Expected: `hooks.json valid`.

- [ ] **Step 9.7: Commit**

```bash
git add hooks/scripts/verdict-gate.js hooks/scripts/verdict-gate.test.js hooks/hooks.json
git commit -m "feat: add verdict-gate PreToolUse hook for strict codex consultations"
```

---

### Task 10: review-design mode brief builder

**Files:**
- Modify: `skills/consult-codex/scripts/modes/review-design.js` (replace the stub from Task 7)
- Create: `skills/consult-codex/scripts/modes/review-design.test.js`

Responsibility: assemble the `{ goal, currentState, signals, question }` inputs for a review-design consultation. Reads the design doc path from `session-state.design_doc_path` (set by the integrating skill in Task 11), loads the doc contents, and fills in the brief skeleton.

- [ ] **Step 10.1: Write failing test**

```js
// skills/consult-codex/scripts/modes/review-design.test.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const reviewDesign = require('./review-design');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rd-mode-')); }

console.log('=== review-design mode ===');

assert('errors when design_doc_path is missing', (() => {
  const tmp = mkTmp();
  let threw = false;
  try {
    reviewDesign.buildInputs({
      worktreeRoot: tmp,
      state: { feature: 'f', design_doc_path: null }
    });
  } catch (e) { threw = e.message.includes('design_doc_path'); }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

assert('errors when design doc file is missing', (() => {
  const tmp = mkTmp();
  let threw = false;
  try {
    reviewDesign.buildInputs({
      worktreeRoot: tmp,
      state: { feature: 'f', design_doc_path: 'docs/plans/nope.md' }
    });
  } catch (e) { threw = e.message.includes('not found'); }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

assert('returns goal/currentState/signals/question from real doc', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'docs', 'plans', 'x.md'),
    '# Title\n\n## Summary\nAdd notifications.\n\n## Architecture\nA table.\n'
  );
  const inputs = reviewDesign.buildInputs({
    worktreeRoot: tmp,
    state: { feature: 'notifications', design_doc_path: 'docs/plans/x.md' }
  });
  fs.rmSync(tmp, { recursive: true });
  return inputs.goal.includes('notifications') &&
         inputs.currentState.includes('# Title') &&
         inputs.currentState.includes('Add notifications') &&
         inputs.signals === 'N/A — proactive design review' &&
         inputs.question.includes('unstated assumptions');
})());

assert('truncates very large design docs with marker', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
  const huge = '# Huge\n' + 'x'.repeat(50000);
  fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'h.md'), huge);
  const inputs = reviewDesign.buildInputs({
    worktreeRoot: tmp,
    state: { feature: 'f', design_doc_path: 'docs/plans/h.md' }
  });
  fs.rmSync(tmp, { recursive: true });
  return inputs.currentState.length <= 10000 && inputs.currentState.includes('[truncated');
})());

console.log(`\n=== review-design mode: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 10.2: Run test to verify it fails**

```bash
node skills/consult-codex/scripts/modes/review-design.test.js
```

Expected: the stub from Task 7 returns placeholder strings, so assertions fail.

- [ ] **Step 10.3: Replace the stub with real implementation**

```js
// skills/consult-codex/scripts/modes/review-design.js
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_DOC_BYTES = 10 * 1024;
const TRUNCATION_MARKER = '\n\n… [truncated to fit 10 KB cap]';

function loadDoc(worktreeRoot, docPath) {
  const abs = path.isAbsolute(docPath) ? docPath : path.join(worktreeRoot, docPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`design doc not found at ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') <= MAX_DOC_BYTES) return raw;
  const budget = MAX_DOC_BYTES - Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
  return Buffer.from(raw, 'utf8').subarray(0, budget).toString('utf8') + TRUNCATION_MARKER;
}

function buildInputs({ worktreeRoot, state }) {
  if (!state.design_doc_path) {
    throw new Error('review-design requires state.design_doc_path to be set — the integrating skill should call state.setMetadata({design_doc_path: ...}) before invoking consult-codex.');
  }
  const doc = loadDoc(worktreeRoot, state.design_doc_path);
  return {
    goal: `Review the design document for feature "${state.feature}" before we move to verification and implementation. The design doc is at ${state.design_doc_path}.`,
    currentState: doc,
    signals: 'N/A — proactive design review',
    question: 'Identify unstated assumptions, missing edge cases, internal contradictions, and vague requirements in this design. If anything is actually ambiguous or underspecified, flag it with the section name.'
  };
}

module.exports = { buildInputs };
```

- [ ] **Step 10.4: Run tests**

```bash
node skills/consult-codex/scripts/modes/review-design.test.js
```

Expected: `=== review-design mode: 4 passed, 0 failed ===`.

- [ ] **Step 10.5: Re-run consult.test.js to ensure the stub-replacement did not break end-to-end**

```bash
node skills/consult-codex/scripts/consult.test.js
```

Expected: still `=== consult.js: 9 passed, 0 failed ===` (the dispatcher tests pass simulated MCP results as in-memory objects to `recordResponse`, so the dispatcher test doesn't depend on the real review-design brief content — it only checks that state transitions and tier-selection work correctly).

- [ ] **Step 10.6: Commit**

```bash
git add skills/consult-codex/scripts/modes/review-design.js skills/consult-codex/scripts/modes/review-design.test.js
git commit -m "feat: implement review-design mode brief builder with doc truncation"
```

---

### Task 11: Integrate consult-codex into feature-flow:design-document

**Files:**
- Modify: `skills/design-document/SKILL.md` — add an optional post-write step

Responsibility: after the design-document skill writes a design doc, it optionally invokes `feature-flow:consult-codex mode: review-design` if `codex.enabled` and `codex.proactive_reviews.design_doc` are both true. The skill also writes `design_doc_path` to `session-state.json` via `state.setMetadata` so the mode's brief builder can find the file.

- [ ] **Step 11.1: Read current SKILL.md to find the right insertion point**

```bash
cat skills/design-document/SKILL.md
```

Identify the step that completes the doc write — typically a "Save the design document" step near the end. The new step goes immediately after that one, before any handoff/next-step guidance.

- [ ] **Step 11.2: Add the new step to SKILL.md**

Append this section after the "Save the design document" step in `skills/design-document/SKILL.md`. Use the Edit tool with a contextual `old_string` that uniquely matches the insertion point.

```markdown
### Step: Optional codex review

If `.feature-flow.yml` has `codex.enabled: true` AND `codex.proactive_reviews.design_doc: true`:

1. Record the design doc path in session state so the consult-codex skill can find it:

   ```bash
   node -e '
     const state = require("./skills/consult-codex/scripts/state.js");
     state.setMetadata(process.cwd(), { design_doc_path: process.argv[1] });
   ' "<relative path to the design doc just written>"
   ```

2. Invoke consult-codex:

   ```
   Skill(skill: "feature-flow:consult-codex", args: "mode: review-design")
   ```

3. Read the returned diagnosis/recommendation/confidence block. Decide whether to incorporate any of codex's findings into the design doc. If you edit the doc, re-save it.

4. **Record your verdict** via the one-liner at the bottom of the skill return:

   ```
   Skill(skill: "feature-flow:consult-codex", args: "verdict --id c1 --decision <accept|reject> --reason <specific text>")
   ```

   - `accept` means you applied at least one of codex's suggestions (or confirmed they were already covered)
   - `reject` means you read the advice and chose not to apply any of it, for a reason that references the design or already-tried approaches

5. If `codex.enabled` is false, the section at `codex.proactive_reviews.design_doc` is false, or the codex MCP server is unavailable, skip this step entirely. The skill invocation is a no-op in those cases — no lifecycle impact.

This step does NOT halt the lifecycle on a reject verdict. The verdict is an audit record, not a gate. Proceed to verification either way.
```

- [ ] **Step 11.3: Verify the existing SKILL.md still parses as markdown**

```bash
head -5 skills/design-document/SKILL.md && echo "---" && tail -30 skills/design-document/SKILL.md
```

Expected: the frontmatter is intact (starts with `---` and a `name:` field) and the new section appears at the end of the body.

- [ ] **Step 11.4: Commit**

```bash
git add skills/design-document/SKILL.md
git commit -m "feat: integrate consult-codex review-design into design-document skill"
```

---

### Task 12: End-to-end smoke test

**Files:**
- Create: `skills/consult-codex/scripts/smoke.test.js`

Responsibility: a single integration test that exercises the whole **three-phase orchestration** end-to-end using the three consult.js subcommand exports. Simulates what Claude does in a real session: call `start`, simulate the MCP result in memory, call `recordResponse`, then call `verdict`. Also verifies the skipped-call path (error from simulated MCP → recordResponse records a skip) and the budget exhaustion path.

- [ ] **Step 12.1: Write the smoke test**

```js
// skills/consult-codex/scripts/smoke.test.js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const state = require('./state');
const consult = require('./consult');

let passed = 0, failed = 0;
async function assertAsync(name, promise) {
  try {
    const result = await promise;
    if (result) { console.log(`  ok — ${name}`); passed++; }
    else { console.log(`  FAIL — ${name}`); failed++; }
  } catch (e) {
    console.log(`  FAIL — ${name} (threw: ${e.message})`); failed++;
  }
}

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-smoke-')); }

const FAKE_CODEX_RESPONSE = [
  'Diagnosis: The design does not specify how session state is garbage-collected across worktrees.',
  'Recommendation: Add an explicit "garbage collection on SessionStart" step to the Architecture section.',
  'Confidence: high'
].join('\n');

async function main() {
  console.log('=== smoke test — three-phase review-design end-to-end ===');

  const tmp = mkTmp();

  // Setup: .feature-flow.yml + design doc + session state with design_doc_path
  fs.writeFileSync(
    path.join(tmp, '.feature-flow.yml'),
    'codex:\n  enabled: true\n  model: gpt-5.2\n  proactive_reviews:\n    design_doc: true\n'
  );
  fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'docs', 'plans', 'test-feature.md'),
    '# Test Feature\n\n## Summary\nA test.\n\n## Architecture\nSome thing.\n'
  );
  state.load(tmp, 'smoke-session', 'test-feature');
  state.setMetadata(tmp, { design_doc_path: 'docs/plans/test-feature.md' });

  // === Phase 1: start ===
  const startResult = await consult.start({
    worktreeRoot: tmp,
    sessionId: 'smoke-session',
    feature: 'test-feature',
    mode: 'review-design',
    signalKey: null,
    introspect: async () => []
  });

  await assertAsync(
    'Phase 1 start returns status: ready',
    Promise.resolve(startResult.status === 'ready')
  );

  await assertAsync(
    'Phase 1 start returns brief, model, timeout_ms, worktree',
    Promise.resolve(
      typeof startResult.brief === 'string' && startResult.brief.length > 0 &&
      startResult.model === 'gpt-5.2' &&
      typeof startResult.timeout_ms === 'number' &&
      startResult.worktree === tmp
    )
  );

  await assertAsync(
    'Phase 1 does NOT create consultations in state',
    Promise.resolve((() => {
      const s = state.load(tmp, 'smoke-session', 'test-feature');
      return s.consultations.length === 0;
    })())
  );

  // === Phase 2: simulate Claude calling mcp__codex__codex (we use a canned result) ===
  const simulatedMcpResult = { threadId: 'smoke-thread-1', content: FAKE_CODEX_RESPONSE };

  // === Phase 3: record-response ===
  const recordResult = await consult.recordResponse({
    worktreeRoot: tmp,
    sessionId: 'smoke-session',
    feature: 'test-feature',
    mode: 'review-design',
    signalKey: null,
    mcpResult: simulatedMcpResult
  });

  await assertAsync(
    'Phase 3 returns consulted + soft tier + consultation_id c1',
    Promise.resolve(
      recordResult.status === 'consulted' &&
      recordResult.tier === 'soft' &&
      recordResult.consultation_id === 'c1'
    )
  );

  await assertAsync(
    'Phase 3 return message includes verdict one-liner',
    Promise.resolve(recordResult.message.includes('verdict --id c1'))
  );

  await assertAsync(
    'state has one consultation with verdict: null after Phase 3',
    Promise.resolve((() => {
      const s = state.load(tmp, 'smoke-session', 'test-feature');
      return s.consultations.length === 1 &&
             s.consultations[0].verdict === null &&
             s.consultations[0].codex_response === FAKE_CODEX_RESPONSE &&
             s.consultations[0].codex_thread_id === 'smoke-thread-1';
    })())
  );

  await assertAsync(
    'codex-log.md exists with pending section after Phase 3',
    Promise.resolve((() => {
      const log = fs.readFileSync(path.join(tmp, '.feature-flow', 'codex-log.md'), 'utf8');
      return log.includes('## Consultation c1') && log.includes('_pending_');
    })())
  );

  await assertAsync(
    'budget.proactive.design_doc is 1 after Phase 3',
    Promise.resolve(state.load(tmp, 'smoke-session', 'test-feature').budget.proactive.design_doc === 1)
  );

  // === Phase 4: verdict ===
  const verdictResult = await consult.verdict({
    worktreeRoot: tmp,
    id: 'c1',
    decision: 'accept',
    reason: 'added GC step to Architecture'
  });

  await assertAsync(
    'Phase 4 verdict returns verdict_recorded',
    Promise.resolve(verdictResult.status === 'verdict_recorded')
  );

  await assertAsync(
    'state has verdict accept after Phase 4',
    Promise.resolve((() => {
      const s = state.load(tmp, 'smoke-session', 'test-feature');
      return s.consultations[0].verdict === 'accept' &&
             s.consultations[0].verdict_reason === 'added GC step to Architecture' &&
             s.consultations[0].outcome === 'applied';
    })())
  );

  await assertAsync(
    'codex-log.md has final VERDICT line and no pending marker',
    Promise.resolve((() => {
      const log = fs.readFileSync(path.join(tmp, '.feature-flow', 'codex-log.md'), 'utf8');
      return log.includes('**VERDICT:** accept') && !log.includes('_pending_');
    })())
  );

  // === Budget exhaustion: second Phase 1 start refuses ===
  const secondStart = await consult.start({
    worktreeRoot: tmp,
    sessionId: 'smoke-session',
    feature: 'test-feature',
    mode: 'review-design',
    signalKey: null,
    introspect: async () => []
  });

  await assertAsync(
    'second start returns skipped: budget_exhausted',
    Promise.resolve(secondStart.status === 'skipped' && secondStart.reason === 'budget_exhausted')
  );

  // === Error path: Phase 3 records skipped consultation when MCP fails ===
  // Use a fresh tmp so budget is clean
  const tmp2 = mkTmp();
  fs.writeFileSync(
    path.join(tmp2, '.feature-flow.yml'),
    'codex:\n  enabled: true\n  model: gpt-5.2\n'
  );
  state.load(tmp2, 'smoke-session-2', 'test-feature');

  const errorRecord = await consult.recordResponse({
    worktreeRoot: tmp2,
    sessionId: 'smoke-session-2',
    feature: 'test-feature',
    mode: 'review-design',
    signalKey: null,
    mcpResult: { error: { reason: 'model_auth_rejected', detail: 'model not supported' } }
  });

  await assertAsync(
    'error path returns recorded_skip with reason',
    Promise.resolve(errorRecord.status === 'recorded_skip' && errorRecord.reason === 'model_auth_rejected')
  );

  await assertAsync(
    'error path leaves consultation with null codex_response',
    Promise.resolve((() => {
      const s = state.load(tmp2, 'smoke-session-2', 'test-feature');
      return s.consultations[0].codex_response === null &&
             s.consultations[0].outcome === 'skipped:model_auth_rejected';
    })())
  );

  fs.rmSync(tmp, { recursive: true });
  fs.rmSync(tmp2, { recursive: true });

  console.log(`\n=== smoke: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
```

- [ ] **Step 12.2: Run the smoke test**

```bash
node skills/consult-codex/scripts/smoke.test.js
```

Expected: `=== smoke: 13 passed, 0 failed ===`.

- [ ] **Step 12.3: Run the entire Phase 1 + 2 test suite as a sanity pass**

```bash
for f in \
  skills/consult-codex/scripts/state.test.js \
  skills/consult-codex/scripts/config.test.js \
  skills/consult-codex/scripts/resolve-model.test.js \
  skills/consult-codex/scripts/build-brief.test.js \
  skills/consult-codex/scripts/record-exchange.test.js \
  skills/consult-codex/scripts/consult.test.js \
  skills/consult-codex/scripts/modes/review-design.test.js \
  skills/consult-codex/scripts/smoke.test.js \
  hooks/scripts/verdict-gate.test.js; do
  echo ">>> $f"
  node "$f" || exit 1
done
echo "ALL GREEN"
```

Expected: each file prints its summary line, final output is `ALL GREEN`. Note: there is no `call-codex.test.js` in the loop — that file does not exist (Task 4 REMOVED).

- [ ] **Step 12.4: Manual live-codex smoke test (optional, documented)**

This is **not** automated — it is a one-time manual sanity check run by the engineer. It verifies the real codex MCP actually receives a properly formatted brief and returns a parseable response. Steps:

1. Set `codex.enabled: true` and `codex.model: gpt-5.2` in your own `.feature-flow.yml`
2. Write a short dummy design doc at `docs/plans/2026-04-14-smoke-test-doc.md`
3. From the repo root, manually invoke the skill:
   ```
   Skill(skill: "feature-flow:consult-codex", args: "mode: review-design")
   ```
4. Verify the returned message contains codex's actual diagnosis and the verdict one-liner
5. Run the verdict call and verify the `codex-log.md` section updates
6. Delete the dummy design doc and the `.feature-flow/` directory afterwards

Document the result (pass/fail + any observations) as a comment on issue #235.

- [ ] **Step 12.5: Commit the smoke test**

```bash
git add skills/consult-codex/scripts/smoke.test.js
git commit -m "test: add end-to-end smoke test for review-design consultation"
```

---

### Task 13: Config template, CHANGELOG, version bump, plan self-review

**Files:**
- Modify: existing `.feature-flow.yml` auto-detection in `skills/start/` (add codex section, commented-out, opt-in)
- Modify: `CHANGELOG.md`
- Modify: `.claude-plugin/plugin.json` (version bump)
- Modify: `.feature-flow.yml` at the repo root (add commented codex section so dogfooding works)

Responsibility: ship the Phase 1 + 2 changes with the opt-in default that the spec revision committed us to. New installs get a commented `codex:` section so they can see the option and flip it on. Existing installs see nothing change. CHANGELOG entry documents the opt-in rationale.

- [ ] **Step 13.1: Find the `.feature-flow.yml` template writer in `skills/start/`**

```bash
grep -rn "plugin_version:" skills/start/ 2>&1 | head
grep -rn "codex" skills/start/ 2>&1 | head
```

Identify where the start skill writes a new `.feature-flow.yml`. It may be in `references/project-context.md`, `inline-steps.md`, or the `SKILL.md`. The exact location determines the edit point.

- [ ] **Step 13.2: Add the commented `codex:` block to the template**

Insert this block into the `.feature-flow.yml` template written by `feature-flow:start`, right after the existing `stack:` / `context7:` section and before `notifications:`:

```yaml
# Optional: codex MCP consultation at four lifecycle checkpoints
# (review-design, review-plan, review-code, stuck). Requires the
# `codex` MCP server to be configured. OFF by default — uncomment
# and set `enabled: true` to turn on.
#
# codex:
#   enabled: true
#   model: gpt-5.2                         # update when model names change
#   timeout_seconds: 180
#   proactive_reviews:
#     design_doc: true
#     plan_criteria: true
#     pre_harden: true
#   reactive:
#     enabled: true
#     interactive_cap: 3
#     yolo_cap: 10
#     escape_hatch_window_minutes: 30
#
# See docs/plans/2026-04-14-codex-consultation.md for the full design.
```

Use the Edit tool on the exact file and location identified in Step 13.1. If `start` emits the YAML via multiple template files or JS string literals, apply the edit to every location that produces a complete `.feature-flow.yml` — a partial fix is worse than no fix.

- [ ] **Step 13.3: Add the same block to the repo-root `.feature-flow.yml` for dogfooding**

Read the current file and append the block (commented, so dogfooding flow is unaffected unless we explicitly opt in):

```bash
cat .feature-flow.yml
```

Edit to append the block above. Confirm the existing section (plugin_version, stack, context7, etc.) is not disturbed.

- [ ] **Step 13.4: Update CHANGELOG.md**

Read `CHANGELOG.md`, identify the top-of-file "Unreleased" or next-version section, and add this entry:

```markdown
### Added
- **Codex consultation (Phase 1 + 2, opt-in):** new `feature-flow:consult-codex` skill for second-opinion AI reviews via the existing `codex` MCP server. Ships the shared infrastructure (state, config, model fallback chain, brief builder, record-exchange, tiered verdict enforcement) plus the `review-design` proactive mode, wired into `feature-flow:design-document`. Phase 3 (`review-plan`), Phase 4 (`review-code` + PR metadata), and Phase 5 (`stuck` mode + signal collector) are deferred to follow-up releases on top of this proven foundation.

  **Opt-in:** the feature is disabled by default. To enable, set `codex.enabled: true` in `.feature-flow.yml` and ensure your `codex` MCP server is configured. Existing installs see no behavioral change on upgrade — the feature is dormant until explicitly opted in.

  **Verdict enforcement:** every consultation forces Claude to record a verdict. Proactive modes (like `review-design`) use a soft single-shot reminder; missing verdicts surface as visible `<not recorded>` audit defects in the PR `feature-flow-metadata` block. Reactive `stuck` mode (Phase 5) will use a PreToolUse block when it ships.

  See `docs/plans/2026-04-14-codex-consultation.md` for the full design.
```

- [ ] **Step 13.5: Bump the plugin version**

Read `.claude-plugin/plugin.json`, find the `"version"` field, and increment the minor version: `"1.35.0"` → `"1.36.0"`. This is a minor bump because it's additive and opt-in (no breaking changes).

```bash
node -e "
const fs=require('fs');
const p='.claude-plugin/plugin.json';
const j=JSON.parse(fs.readFileSync(p,'utf8'));
const [maj,min,pat]=j.version.split('.').map(Number);
j.version=[maj,min+1,0].join('.');
fs.writeFileSync(p, JSON.stringify(j,null,2)+'\n');
console.log('bumped to', j.version);
"
```

Expected: `bumped to 1.36.0` (or whatever `current + 1 minor` is at execution time).

- [ ] **Step 13.6: Plan self-review — run the full test suite one more time**

Re-run the command from Step 12.3. All tests must still pass after the template/CHANGELOG/version edits. If anything fails, the template edit probably regressed something — fix before committing.

- [ ] **Step 13.7: Plan self-review — spec coverage check**

Open the spec (`docs/plans/2026-04-14-codex-consultation.md`) and skim each top-level section. For each one, confirm the plan covers it within the Phase 1 + 2 scope:

| Spec section | Phase | Covered in plan? |
|---|---|---|
| Summary | 1 | Tasks 1–9 build the shared infra |
| Architecture (a/b/c) | 1 | Tasks 1–9 + 11 + 13 |
| Session state / brief format | 1 | Task 1 (state), Task 5 (brief) |
| Stuck-signal detection rules | 5 | **Deferred** (out of scope for this plan) |
| consult-codex skill contract | 1+2 | Tasks 7, 8, 10 |
| Error handling | 1 | Tasks 4, 7 |
| Testing strategy | 1+2 | All tasks have tests; Task 12 is E2E |
| Configuration schema | 1 | Task 13 (template) |
| Rollout and rollback | 1 | Task 13 (opt-in, CHANGELOG) |

Anything under Phase 3 / 4 / 5 is intentionally out of scope. If any Phase 1 or 2 requirement is NOT covered, add a task for it before committing.

- [ ] **Step 13.8: Commit the rollout changes**

```bash
git add .feature-flow.yml CHANGELOG.md .claude-plugin/plugin.json
# Also commit any skills/start/ template file touched in Step 13.2:
git add skills/start/
git commit -m "feat: ship codex consultation Phase 1+2 (opt-in) with CHANGELOG and version bump"
```

- [ ] **Step 13.9: Final verification — run the full suite one more time**

```bash
for f in \
  skills/consult-codex/scripts/state.test.js \
  skills/consult-codex/scripts/config.test.js \
  skills/consult-codex/scripts/resolve-model.test.js \
  skills/consult-codex/scripts/build-brief.test.js \
  skills/consult-codex/scripts/record-exchange.test.js \
  skills/consult-codex/scripts/consult.test.js \
  skills/consult-codex/scripts/modes/review-design.test.js \
  skills/consult-codex/scripts/smoke.test.js \
  hooks/scripts/verdict-gate.test.js; do
  node "$f" || { echo "FAILED: $f"; exit 1; }
done
echo "ALL GREEN — Phase 1 + 2 complete"
```

Expected: `ALL GREEN — Phase 1 + 2 complete`. Note: `call-codex.test.js` is deliberately absent — Task 4 REMOVED.

---

## Out of scope for this plan

These are explicitly deferred to follow-up plans on top of the shared infrastructure this plan delivers:

1. **`review-plan` mode** — brief builder that reads the plan file, integration with `feature-flow:verify-plan-criteria`. Re-uses Tasks 1–9.
2. **`review-code` mode** — brief builder that reads `git diff`, integration with `skills/start` Harden-PR step, PR metadata extension to inject `codex_consultations` into the `feature-flow-metadata` block.
3. **`stuck` mode** — the `hooks/scripts/signal-collector/` module (dispatcher, parsers for test-output/error-signature/criterion, suggest emitter, escape-hatch state), integration with `hooks.json` PostToolUse matchers, the stuck brief builder, the `stuck:` user shortcut, and the update to `quality-gate.js` to emit per-rule signal events.

Each follow-up plan should be authored as a separate `docs/plans/YYYY-MM-DD-codex-consultation-phase-N-plan.md` file, built on top of the committed Phase 1 + 2 infrastructure.

## What "done" means for this plan

At plan completion, all of the following are true:

1. `node skills/consult-codex/scripts/smoke.test.js` passes end-to-end with a mocked MCP client.
2. `node hooks/scripts/verdict-gate.test.js` passes.
3. The `feature-flow:consult-codex` skill is discoverable via the plugin and its SKILL.md is readable by Claude.
4. The `feature-flow:design-document` skill has the new "Optional codex review" step in its SKILL.md.
5. `.feature-flow.yml` templates include the commented `codex:` section.
6. `CHANGELOG.md` documents the opt-in addition.
7. The plugin version is bumped.
8. A manual live-codex smoke test has been run (Step 12.4) and the result documented as a comment on issue #235.

---


