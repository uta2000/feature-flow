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
