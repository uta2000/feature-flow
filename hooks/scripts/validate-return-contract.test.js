#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.resolve(__dirname, 'validate-return-contract.js');

function writeFixture(obj) {
  const p = path.join(os.tmpdir(), `vcr-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(p, JSON.stringify(obj));
  return p;
}

function run(fixturePath) {
  try {
    const stdout = execSync(`node ${SCRIPT} ${fixturePath}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return { code: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  PASS: ${name}`); passed++; }
  catch (err) { console.error(`  FAIL: ${name}\n    ${err.message}`); failed++; }
}

const VALID = {
  schema_version: 1,
  phase: 'verify-plan-criteria',
  status: 'success',
  plan_path: '/tmp/plan.md',
  criteria_total: 5,
  criteria_machine_verifiable: 5,
  criteria_added_by_agent: 0,
  tasks_missing_criteria: []
};

test('valid contract exits 0', () => {
  const p = writeFixture(VALID);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0, got ${r.code}\n${r.stderr}`);
});

test('missing required field exits 1', () => {
  const bad = { ...VALID }; delete bad.criteria_total;
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for missing field');
  if (!r.stdout.includes('missing required field')) throw new Error(`expected "missing required field" in output; got: ${r.stdout}`);
});

test('invalid status exits 1', () => {
  const bad = { ...VALID, status: 'unknown-status' };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for invalid status');
});

test('unknown phase exits 1', () => {
  const bad = { ...VALID, phase: 'no-such-phase' };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for unknown phase');
  if (!r.stderr.includes('unknown phase')) throw new Error(`expected "unknown phase" in stderr; got: ${r.stderr}`);
});

test('tasks_missing_criteria with non-string item exits 1', () => {
  const bad = { ...VALID, tasks_missing_criteria: [1, 2] };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for non-string array items');
});

test('partial status is valid', () => {
  const partial = { ...VALID, status: 'partial', tasks_missing_criteria: ['Task 3'] };
  const p = writeFixture(partial);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0 for partial status; got ${r.code}\n${r.stderr}`);
});

test('failed status is valid', () => {
  const failed_status = { ...VALID, status: 'failed' };
  const p = writeFixture(failed_status);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0 for failed status; got ${r.code}\n${r.stderr}`);
});

test('wrong field type exits 1', () => {
  const bad = { ...VALID, criteria_total: 'five' };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for string criteria_total');
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
