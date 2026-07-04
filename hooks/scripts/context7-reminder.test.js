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
    if (parsed.hookSpecificOutput?.hookEventName !== 'PreToolUse') return null;
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
  const ctx = advisoryContext(r) || '';
  let parsed;
  try { parsed = JSON.parse(r.stdout); } catch { return false; }
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
