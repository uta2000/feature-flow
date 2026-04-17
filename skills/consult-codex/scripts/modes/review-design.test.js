#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const reviewDesign = require('./review-design');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'rd-mode-')); }

console.log('=== review-design mode ===');

assert('errors when design_doc_path is missing', (() => {
  const tmp = mkTmp();
  let threw = false;
  try {
    reviewDesign.buildInputs({
      worktreeRoot: tmp,
      state: { feature: 'f', design_doc_path: null }
    });
  } catch (e) { threw = e.message.includes('design_doc_path'); }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

assert('errors when design doc file is missing', (() => {
  const tmp = mkTmp();
  let threw = false;
  try {
    reviewDesign.buildInputs({
      worktreeRoot: tmp,
      state: { feature: 'f', design_doc_path: 'docs/plans/nope.md' }
    });
  } catch (e) { threw = e.message.includes('not found'); }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

assert('rejects path traversal outside worktree', (() => {
  const tmp = mkTmp();
  let threw = false;
  try {
    reviewDesign.buildInputs({
      worktreeRoot: tmp,
      state: { feature: 'f', design_doc_path: '../../etc/passwd' }
    });
  } catch (e) {
    threw = e.message.includes('outside worktree') || e.message.includes('refusing');
  }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

assert('rejects absolute path outside worktree', (() => {
  const tmp = mkTmp();
  let threw = false;
  try {
    reviewDesign.buildInputs({
      worktreeRoot: tmp,
      state: { feature: 'f', design_doc_path: '/etc/hosts' }
    });
  } catch (e) {
    threw = e.message.includes('outside worktree') || e.message.includes('refusing');
  }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

assert('returns goal/currentState/signals/question from real doc', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'docs', 'plans', 'x.md'),
    '# Title\n\n## Summary\nAdd notifications.\n\n## Architecture\nA table.\n'
  );
  const inputs = reviewDesign.buildInputs({
    worktreeRoot: tmp,
    state: { feature: 'notifications', design_doc_path: 'docs/plans/x.md' }
  });
  fs.rmSync(tmp, { recursive: true });
  return inputs.goal.includes('notifications') &&
         inputs.currentState.includes('# Title') &&
         inputs.currentState.includes('Add notifications') &&
         inputs.signals === 'N/A — proactive design review' &&
         inputs.question.includes('unstated assumptions');
})());

assert('truncates very large design docs with marker (ascii input)', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
  const huge = '# Huge\n' + 'x'.repeat(50000);
  fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'h.md'), huge);
  const inputs = reviewDesign.buildInputs({
    worktreeRoot: tmp,
    state: { feature: 'f', design_doc_path: 'docs/plans/h.md' }
  });
  fs.rmSync(tmp, { recursive: true });
  return Buffer.byteLength(inputs.currentState, 'utf8') <= 10240 &&
         inputs.currentState.includes('[truncated');
})());

assert('truncates respecting utf-8 codepoint boundaries', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
  const huge = '日'.repeat(20000); // 3 bytes/char — boundary exercise
  fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'h.md'), huge);
  const inputs = reviewDesign.buildInputs({
    worktreeRoot: tmp,
    state: { feature: 'f', design_doc_path: 'docs/plans/h.md' }
  });
  fs.rmSync(tmp, { recursive: true });
  return Buffer.byteLength(inputs.currentState, 'utf8') <= 10240 &&
         inputs.currentState.includes('[truncated') &&
         !inputs.currentState.includes('\uFFFD');
})());

console.log(`\n=== review-design mode: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
