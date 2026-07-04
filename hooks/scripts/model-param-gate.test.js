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
