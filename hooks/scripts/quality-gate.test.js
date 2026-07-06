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

function runGate(cwd, payload, extraEnv) {
  try {
    const out = execSync(`node ${SCRIPT}`, {
      cwd,
      input: payload === undefined ? undefined : (typeof payload === 'string' ? payload : JSON.stringify(payload)),
      encoding: 'utf8',
      timeout: 30000,
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
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

assert('crashed check (.feature-flow.yml is a directory → EISDIR): blocks as inconclusive and writes NO verified marker', (() => {
  const tmp = mkTmp();
  execSync('git init -q', { cwd: tmp });
  execSync('git config user.email "test@example.com"', { cwd: tmp });
  execSync('git config user.name "Test"', { cwd: tmp });
  // A DIRECTORY named .feature-flow.yml makes checkTypeSync's readFileSync throw
  // EISDIR, which propagates to the outer .catch — a check that CRASHED, not one
  // that reported a failure. Pre-fix this was demoted to a warning and the marker
  // was still stamped (cache poisoning).
  fs.mkdirSync(path.join(tmp, '.feature-flow.yml'));
  execSync('git add -A && git commit -q -m init --allow-empty', { cwd: tmp });
  const gitDir = execSync('git rev-parse --git-dir', { cwd: tmp, encoding: 'utf8' }).trim();
  const markerPath = path.join(tmp, gitDir, 'feature-flow-verified');

  const r = runGate(tmp, { stop_hook_active: false });
  const markerExists = fs.existsSync(markerPath);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
  fs.rmSync(tmp, { recursive: true });

  return r.exitCode === 0
    && !!parsed && parsed.decision === 'block'
    && /inconclusive/i.test(parsed.reason || '')
    && !markerExists;
})());

assert('test-suite timeout: blocks as inconclusive and writes NO verified marker', (() => {
  const tmp = mkTmp();
  execSync('git init -q', { cwd: tmp });
  execSync('git config user.email "test@example.com"', { cwd: tmp });
  execSync('git config user.name "Test"', { cwd: tmp });
  // Test script sleeps far longer than the env-shrunk timeout, guaranteeing the
  // SIGTERM-kill branch fires (the child can never complete first).
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { test: 'node -e "setTimeout(()=>{}, 30000)"' } })
  );
  fs.mkdirSync(path.join(tmp, 'node_modules')); // detectTestCommand requires node_modules for `npm test`
  execSync('git add -A && git commit -q -m init', { cwd: tmp });
  const gitDir = execSync('git rev-parse --git-dir', { cwd: tmp, encoding: 'utf8' }).trim();
  const markerPath = path.join(tmp, gitDir, 'feature-flow-verified');

  const r = runGate(tmp, { stop_hook_active: false }, { FF_QG_TEST_TIMEOUT_MS: '400' });
  const markerExists = fs.existsSync(markerPath);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
  fs.rmSync(tmp, { recursive: true });

  return r.exitCode === 0
    && !!parsed && parsed.decision === 'block'
    && /inconclusive|timed out/i.test(parsed.reason || '')
    && !markerExists;
})());

assert('passing test suite with >1MB output: does NOT block and writes the verified marker (maxBuffer regression)', (() => {
  const tmp = mkTmp();
  execSync('git init -q', { cwd: tmp });
  execSync('git config user.email "test@example.com"', { cwd: tmp });
  execSync('git config user.name "Test"', { cwd: tmp });
  // A PASSING suite that prints ~1.3MB — over exec's 1MB default buffer but well under
  // the 64MB cap. Pre-fix this overflowed and was mis-reported as a failing test;
  // post-fix the raised buffer lets it complete and the run verifies clean.
  // NOTE: console.log in a loop with NO process.exit() — async stdout to a pipe must
  // flush on natural exit; process.exit() would truncate the output and never overflow.
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { test: 'node -e "for(let i=0;i<18000;i++)console.log(\'x\'.repeat(72))"' } })
  );
  fs.mkdirSync(path.join(tmp, 'node_modules')); // detectTestCommand requires node_modules for `npm test`
  execSync('git add -A && git commit -q -m init', { cwd: tmp });
  const gitDir = execSync('git rev-parse --git-dir', { cwd: tmp, encoding: 'utf8' }).trim();
  const markerPath = path.join(tmp, gitDir, 'feature-flow-verified');

  const r = runGate(tmp, { stop_hook_active: false });
  const markerExists = fs.existsSync(markerPath);
  fs.rmSync(tmp, { recursive: true });

  // Clean pass: no block JSON on stdout, exits 0, and the marker was written.
  return r.exitCode === 0 && (r.stdout || '').trim() === '' && markerExists;
})());

assert('test output overflows the buffer: blocks as inconclusive ("too large", NOT "timed out"), writes NO marker', (() => {
  const tmp = mkTmp();
  execSync('git init -q', { cwd: tmp });
  execSync('git config user.email "test@example.com"', { cwd: tmp });
  execSync('git config user.name "Test"', { cwd: tmp });
  // A PASSING suite that prints ~50KB, run with the buffer shrunk to 8KB via env so it
  // overflows deterministically without generating 64MB. Exercises the belt-and-suspenders
  // ERR_CHILD_PROCESS_STDIO_MAXBUFFER branch: an overflow must be inconclusive, never a
  // red test, and must NOT be mislabeled a timeout.
  // NOTE: console.log loop + natural exit (see the >1MB test above for why not process.exit).
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { test: 'node -e "for(let i=0;i<700;i++)console.log(\'x\'.repeat(72))"' } })
  );
  fs.mkdirSync(path.join(tmp, 'node_modules'));
  execSync('git add -A && git commit -q -m init', { cwd: tmp });
  const gitDir = execSync('git rev-parse --git-dir', { cwd: tmp, encoding: 'utf8' }).trim();
  const markerPath = path.join(tmp, gitDir, 'feature-flow-verified');

  const r = runGate(tmp, { stop_hook_active: false }, { FF_QG_MAX_BUFFER: '8192' });
  const markerExists = fs.existsSync(markerPath);
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { parsed = null; }
  fs.rmSync(tmp, { recursive: true });

  return r.exitCode === 0
    && !!parsed && parsed.decision === 'block'
    && /inconclusive/i.test(parsed.reason || '')
    && /too large/i.test(parsed.reason || '')
    && /8KB/i.test(parsed.reason || '')      // buffer size reported in the right unit,
    && !/0MB/.test(parsed.reason || '')      // not a misleading rounded-to-zero ">0MB"
    && !/timed out/i.test(parsed.reason || '')
    && !markerExists;
})());

assert('invalid (negative) FF_QG_MAX_BUFFER falls back to the default: passing suite verifies clean, no crash', (() => {
  const tmp = mkTmp();
  execSync('git init -q', { cwd: tmp });
  execSync('git config user.email "test@example.com"', { cwd: tmp });
  execSync('git config user.name "Test"', { cwd: tmp });
  // A trivially-passing suite. With a negative buffer override, the naive
  // `Number(env) || default` parse would pass -100 straight to exec(), which throws
  // RangeError (maxBuffer must be >= 0) — turning a clean run into a false block.
  // The positive-number guard must fall back to the 64MB default instead.
  fs.writeFileSync(
    path.join(tmp, 'package.json'),
    JSON.stringify({ name: 'fixture', scripts: { test: 'node -e "console.log(\'ok\')"' } })
  );
  fs.mkdirSync(path.join(tmp, 'node_modules'));
  execSync('git add -A && git commit -q -m init', { cwd: tmp });
  const gitDir = execSync('git rev-parse --git-dir', { cwd: tmp, encoding: 'utf8' }).trim();
  const markerPath = path.join(tmp, gitDir, 'feature-flow-verified');

  const r = runGate(tmp, { stop_hook_active: false }, { FF_QG_MAX_BUFFER: '-100' });
  const markerExists = fs.existsSync(markerPath);
  fs.rmSync(tmp, { recursive: true });

  // Clean pass: no block JSON, exits 0, marker written (proves exec never saw -100).
  return r.exitCode === 0 && (r.stdout || '').trim() === '' && markerExists;
})());

console.log(`\n=== quality-gate.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
