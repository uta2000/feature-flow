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

function run(cwd, payload, extraEnv) {
  try {
    const out = execSync(`node ${SCRIPT}`, {
      cwd,
      input: typeof payload === 'string' ? payload : JSON.stringify(payload),
      encoding: 'utf8',
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
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
  return parsed.hookSpecificOutput?.hookEventName === 'PostToolUse'
    && ctx.includes('LINT ERRORS') && ctx.includes('some rule');
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

assert('advises via additionalContext when the linter cannot be spawned (killed/unspawnable)', (() => {
  const tmp = mkTmp();
  // eslint is detected (node_modules/.bin/eslint + .eslintrc.json), so runLinter
  // will try to spawn `npx eslint <file>`.
  setupFakeLinter(tmp, 'eslint', 0, '');
  // A fake `npx` first on PATH that kills itself with SIGTERM → spawnSync returns
  // result.signal set (the "linter failed to run" branch). Pre-fix this returned
  // null, silently indistinguishable from a clean lint.
  const fakeBin = path.join(tmp, 'fakebin');
  fs.mkdirSync(fakeBin, { recursive: true });
  const npxShim = path.join(fakeBin, 'npx');
  fs.writeFileSync(npxShim, '#!/bin/sh\nkill -TERM $$\n');
  fs.chmodSync(npxShim, 0o755);
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  const filePath = path.join(tmp, 'src', 'foo.ts');
  fs.writeFileSync(filePath, 'const x = 1;');

  const r = run(tmp, { tool_name: 'Write', tool_input: { file_path: filePath } }, {
    PATH: `${fakeBin}:${process.env.PATH}`,
  });
  fs.rmSync(tmp, { recursive: true });
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return false; }
  const ctx = parsed.hookSpecificOutput?.additionalContext || '';
  return parsed.hookSpecificOutput?.hookEventName === 'PostToolUse'
    && /did not run|failed to (run|start)/i.test(ctx);
})());

console.log(`\n=== lint-file.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
