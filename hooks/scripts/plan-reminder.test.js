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
    if (parsed.hookSpecificOutput?.hookEventName !== 'PostToolUse') return null;
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
