#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('./state');
const record = require('./record-exchange');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-rec-')); }
function readLog(tmp) {
  const p = path.join(tmp, '.feature-flow', 'codex-log.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

console.log('=== record-exchange.js ===');

assert('recordConsultation appends to state and writes pending log section', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c = record.recordConsultation(tmp, {
    mode: 'review-design',
    strict: false,
    trigger: 'proactive',
    brief: '# brief\nsome brief text',
    codex_response: 'diagnosis: fine\nrecommendation: ship\nconfidence: high',
    codex_thread_id: 'thread-1'
  });
  const log = readLog(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.id === 'c1' &&
         log.includes('## Consultation c1') &&
         log.includes('mode: review-design') &&
         log.includes('thread-1') &&
         log.includes('### Verdict\n_pending_');
})());

assert('recordVerdict updates state and rewrites pending section', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c = record.recordConsultation(tmp, {
    mode: 'stuck', strict: true, trigger: 'reactive',
    brief: '# brief', codex_response: 'diag', codex_thread_id: 't'
  });
  record.recordVerdict(tmp, c.id, { decision: 'accept', reason: 'spotted the replica mismatch', outcome: 'applied' });
  const reloaded = state.load(tmp, 'sess', 'feat');
  const log = readLog(tmp);
  fs.rmSync(tmp, { recursive: true });
  return reloaded.consultations[0].verdict === 'accept' &&
         log.includes('**VERDICT:** accept — spotted the replica mismatch') &&
         !log.includes('_pending_');
})());

assert('recordVerdict on unknown id throws', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  let threw = false;
  try { record.recordVerdict(tmp, 'c99', { decision: 'accept', reason: 'x', outcome: 'applied' }); }
  catch { threw = true; }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

console.log(`\n=== record-exchange.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
