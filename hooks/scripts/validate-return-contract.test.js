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

// design-document tests (Wave 3 phase 3 — Pattern B)
const VALID_DD = {
  schema_version: 1,
  phase: 'design-document',
  status: 'success',
  design_issue_url: 'https://github.com/uta2000/feature-flow/issues/251',
  issue_number: 251,
  design_section_present: true,
  key_decisions: ['Pattern B: hoist + consolidator'],
  open_questions: [],
  tbd_count: 0
};

test('design-document: valid contract exits 0', () => {
  const p = writeFixture(VALID_DD);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0, got ${r.code}\n${r.stderr}`);
});

test('design-document: missing required field exits 1', () => {
  const bad = { ...VALID_DD }; delete bad.issue_number;
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for missing issue_number');
  if (!r.stdout.includes('missing required field')) throw new Error(`expected "missing required field" in output; got: ${r.stdout}`);
});

test('design-document: wrong field type (issue_number string) exits 1', () => {
  const bad = { ...VALID_DD, issue_number: '251' };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for string issue_number');
});

test('design-document: design_section_present non-boolean exits 1', () => {
  const bad = { ...VALID_DD, design_section_present: 'true' };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for non-boolean design_section_present');
});

test('design-document: key_decisions with non-string item exits 1', () => {
  const bad = { ...VALID_DD, key_decisions: [1, 2] };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for non-string key_decisions item');
});

test('design-document: open_questions with non-string item exits 1', () => {
  const bad = { ...VALID_DD, open_questions: [{ q: 'x' }] };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for non-string open_questions item');
});

test('design-document: partial status with tbd_count > 0 is valid', () => {
  const partial = { ...VALID_DD, status: 'partial', tbd_count: 3 };
  const p = writeFixture(partial);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0 for partial status; got ${r.code}\n${r.stderr}`);
});

// verify-acceptance-criteria tests (Wave 3 phase 4 — Pattern B, #251)
const VALID_VAC = {
  schema_version: 1,
  phase: 'verify-acceptance-criteria',
  status: 'success',
  report_path: '/tmp/ff-verify-ac-report-ddc1.md',
  pass_count: 18,
  fail_count: 0,
  failed_criteria: []
};

test('verify-acceptance-criteria: valid contract exits 0', () => {
  const p = writeFixture(VALID_VAC);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0, got ${r.code}\n${r.stderr}`);
});

test('verify-acceptance-criteria: missing required field exits 1', () => {
  const bad = { ...VALID_VAC }; delete bad.pass_count;
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for missing pass_count');
  if (!r.stdout.includes('missing required field')) throw new Error(`expected "missing required field" in output; got: ${r.stdout}`);
});

test('verify-acceptance-criteria: failed_criteria with non-object item exits 1', () => {
  const bad = { ...VALID_VAC, status: 'partial', failed_criteria: ['Task 1: foo'] };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for string item in failed_criteria');
});

test('verify-acceptance-criteria: failed_criteria object missing task_id exits 1', () => {
  const bad = { ...VALID_VAC, status: 'partial', failed_criteria: [{ criterion: 'x', reason: 'y' }] };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for failed_criteria item missing task_id');
});

test('verify-acceptance-criteria: failed_criteria object with non-string field exits 1', () => {
  const bad = { ...VALID_VAC, status: 'partial', failed_criteria: [{ task_id: 1, criterion: 'x', reason: 'y' }] };
  const p = writeFixture(bad);
  const r = run(p);
  if (r.code === 0) throw new Error('expected non-zero exit for non-string task_id');
});

test('verify-acceptance-criteria: partial status with non-empty failed_criteria is valid', () => {
  const partial = {
    ...VALID_VAC,
    status: 'partial',
    fail_count: 1,
    failed_criteria: [{ task_id: 'Task 3', criterion: 'File exists at src/foo.ts', reason: 'file not found' }]
  };
  const p = writeFixture(partial);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0 for partial with valid failed_criteria; got ${r.code}\n${r.stderr}`);
});

test('verify-acceptance-criteria: failed status is valid', () => {
  const failed_status = { ...VALID_VAC, status: 'failed' };
  const p = writeFixture(failed_status);
  const r = run(p);
  if (r.code !== 0) throw new Error(`expected exit 0 for failed status; got ${r.code}\n${r.stderr}`);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
