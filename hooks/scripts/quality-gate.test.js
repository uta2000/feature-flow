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

assert('verification marker: clean tree at verified commit short-circuits (no block despite failing lint); dirty tree re-runs and blocks', (() => {
  const tmp = mkTmp();
  mkFailingProject(tmp);
  execSync('git init -q', { cwd: tmp });
  execSync('git config user.email "test@example.com"', { cwd: tmp });
  execSync('git config user.name "Test"', { cwd: tmp });
  execSync('git add -A', { cwd: tmp });
  execSync('git commit -q -m init', { cwd: tmp });
  const head = execSync('git rev-parse HEAD', { cwd: tmp, encoding: 'utf8' }).trim();
  const gitDir = execSync('git rev-parse --git-dir', { cwd: tmp, encoding: 'utf8' }).trim();
  fs.writeFileSync(path.join(tmp, gitDir, 'feature-flow-verified'), head + '\n');

  const clean = runGate(tmp, { stop_hook_active: false });
  const cleanOk = clean.exitCode === 0 && (clean.stdout || '').trim() === '';

  fs.writeFileSync(path.join(tmp, 'README.md'), 'dirty\n');
  const dirty = runGate(tmp, { stop_hook_active: false });
  let parsed;
  try { parsed = JSON.parse(dirty.stdout); } catch { parsed = null; }
  const dirtyOk = dirty.exitCode === 0 && parsed && parsed.decision === 'block';

  fs.rmSync(tmp, { recursive: true });
  return cleanOk && dirtyOk;
})());

console.log(`\n=== quality-gate.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
