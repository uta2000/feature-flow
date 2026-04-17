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

assert('allows verdict call with leading whitespace', (() => {
  const tmp = mkTmp();
  writeState(tmp, { session_id: 'x', consultations: [
    { id: 'c4', strict: true, verdict: null, mode: 'stuck', signal_key: 'k' }
  ]});
  const r = runGate(tmp, {
    skill: 'feature-flow:consult-codex',
    args: '   verdict --id c4 --decision accept --reason ok'
  });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('allows verdict call with --id=c5 (equals form)', (() => {
  const tmp = mkTmp();
  writeState(tmp, { session_id: 'x', consultations: [
    { id: 'c5', strict: true, verdict: null, mode: 'stuck', signal_key: 'k' }
  ]});
  const r = runGate(tmp, {
    skill: 'feature-flow:consult-codex',
    args: 'verdict --id=c5 --decision accept --reason ok'
  });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when tool_name is not Skill', (() => {
  const tmp = mkTmp();
  writeState(tmp, { session_id: 'x', consultations: [
    { id: 'c6', strict: true, verdict: null, mode: 'stuck' }
  ]});
  // Override the runGate input — directly exec with a Bash tool name
  let r;
  try {
    const out = require('child_process').execSync(`node ${SCRIPT}`, {
      cwd: tmp,
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } }),
      encoding: 'utf8'
    });
    r = { exitCode: 0, stdout: out };
  } catch (err) {
    r = { exitCode: err.status || 1, stdout: err.stdout || '' };
  }
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when state file is missing', (() => {
  const tmp = mkTmp();
  // No writeState call — state file does not exist.
  const r = runGate(tmp, { skill: 'any-skill', args: 'whatever' });
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('exits 0 silently when state JSON is corrupt', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, '.feature-flow'), { recursive: true });
  fs.writeFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), '{ corrupt');
  const r = runGate(tmp, { skill: 'any', args: 'x' });
  fs.rmSync(tmp, { recursive: true });
  // Stderr warning is expected but stdout must be silent (fail-open)
  return r.exitCode === 0 && (r.stdout || '').trim() === '';
})());

assert('blocks when skill name does not match consult-codex despite verdict-style args', (() => {
  const tmp = mkTmp();
  writeState(tmp, { session_id: 'x', consultations: [
    { id: 'c7', strict: true, verdict: null, mode: 'stuck' }
  ]});
  const r = runGate(tmp, {
    skill: 'feature-flow:start',  // wrong skill name
    args: 'verdict --id c7 --decision accept --reason ok'
  });
  fs.rmSync(tmp, { recursive: true });
  return r.stdout.includes('BLOCK') && r.stdout.includes('c7');
})());

console.log(`\n=== verdict-gate.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
