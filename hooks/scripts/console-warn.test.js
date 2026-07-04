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
