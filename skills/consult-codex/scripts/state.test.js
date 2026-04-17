#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const state = require('./state');

let passed = 0;
let failed = 0;

function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-state-'));
}

console.log('=== state.js ===');

// load creates fresh state if file missing
assert('load creates fresh state when file is missing', (() => {
  const tmp = mkTmp();
  const s = state.load(tmp, 'session-abc', 'my-feature');
  fs.rmSync(tmp, { recursive: true });
  return s.session_id === 'session-abc' &&
         s.feature === 'my-feature' &&
         Array.isArray(s.consultations) &&
         s.consultations.length === 0 &&
         s.budget && s.budget.proactive && s.budget.reactive &&
         s.signals && s.escape_hatch_state;
})());

// load GCs on session-id mismatch
assert('load GCs existing state when session_id does not match', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, '.feature-flow'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, '.feature-flow', 'session-state.json'),
    JSON.stringify({ session_id: 'old', consultations: [{ id: 'c1' }] })
  );
  const s = state.load(tmp, 'new', 'feat');
  fs.rmSync(tmp, { recursive: true });
  return s.session_id === 'new' && s.consultations.length === 0;
})());

// save is atomic — writes temp file, renames
assert('save writes via temp-then-rename', (() => {
  const tmp = mkTmp();
  const s = state.load(tmp, 'sess-1', 'feat');
  s.feature = 'updated';
  state.save(tmp, s);
  const onDisk = JSON.parse(fs.readFileSync(
    path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'
  ));
  // .tmp sibling should not exist after successful save
  const tmpExists = fs.existsSync(
    path.join(tmp, '.feature-flow', 'session-state.json.tmp')
  );
  fs.rmSync(tmp, { recursive: true });
  return onDisk.feature === 'updated' && !tmpExists;
})());

// load recovers from corrupt JSON by renaming to .bak
assert('load renames corrupt json to .bak and creates fresh', (() => {
  const tmp = mkTmp();
  fs.mkdirSync(path.join(tmp, '.feature-flow'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, '.feature-flow', 'session-state.json'),
    '{ not valid json'
  );
  const s = state.load(tmp, 'sess', 'feat');
  const bakFiles = fs.readdirSync(path.join(tmp, '.feature-flow'))
    .filter(f => f.startsWith('session-state.json.bak-'));
  fs.rmSync(tmp, { recursive: true });
  return s.session_id === 'sess' && bakFiles.length === 1;
})());

// setMetadata merges keys without touching others
assert('setMetadata updates named keys only', (() => {
  const tmp = mkTmp();
  const s = state.load(tmp, 'sess', 'feat');
  state.setMetadata(tmp, { design_doc_path: 'docs/plans/foo.md' });
  const reloaded = state.load(tmp, 'sess', 'feat');
  fs.rmSync(tmp, { recursive: true });
  return reloaded.design_doc_path === 'docs/plans/foo.md' &&
         reloaded.feature === 'feat';
})());

// appendConsultation increments id sequentially
assert('appendConsultation assigns sequential ids starting at c1', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c1 = state.appendConsultation(tmp, { mode: 'review-design', strict: false });
  const c2 = state.appendConsultation(tmp, { mode: 'review-plan', strict: false });
  fs.rmSync(tmp, { recursive: true });
  return c1.id === 'c1' && c2.id === 'c2';
})());

// setVerdict mutates named consultation
assert('setVerdict updates verdict, reason, outcome', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c = state.appendConsultation(tmp, { mode: 'stuck', strict: true });
  state.setVerdict(tmp, c.id, { decision: 'accept', reason: 'matched', outcome: 'applied' });
  const reloaded = state.load(tmp, 'sess', 'feat');
  fs.rmSync(tmp, { recursive: true });
  return reloaded.consultations[0].verdict === 'accept' &&
         reloaded.consultations[0].verdict_reason === 'matched' &&
         reloaded.consultations[0].outcome === 'applied';
})());

// setVerdict throws when consultation id does not exist
assert('setVerdict throws when consultation id does not exist', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  let threw = false;
  try {
    state.setVerdict(tmp, 'c999', { decision: 'accept', reason: 'x', outcome: 'applied' });
  } catch (e) {
    threw = /consultation c999 not found/.test(e.message);
  }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

// mutators throw clear error when load() was never called
assert('appendConsultation throws clear error when load() was never called', (() => {
  const tmp = mkTmp();
  let threw = false;
  try {
    state.appendConsultation(tmp, { mode: 'review-design', strict: false });
  } catch (e) {
    threw = /state not initialized/.test(e.message);
  }
  fs.rmSync(tmp, { recursive: true });
  return threw;
})());

// pending strict consultation detection
assert('findPendingStrict returns a strict consultation with null verdict', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  state.appendConsultation(tmp, { mode: 'review-design', strict: false });
  const stuckC = state.appendConsultation(tmp, { mode: 'stuck', strict: true });
  const pending = state.findPendingStrict(tmp);
  fs.rmSync(tmp, { recursive: true });
  return pending && pending.id === stuckC.id;
})());

// findPendingStrict returns null when all strict consultations are resolved
assert('findPendingStrict returns null when verdict is recorded', (() => {
  const tmp = mkTmp();
  state.load(tmp, 'sess', 'feat');
  const c = state.appendConsultation(tmp, { mode: 'stuck', strict: true });
  state.setVerdict(tmp, c.id, { decision: 'reject', reason: 'already tried', outcome: 'rejected' });
  const pending = state.findPendingStrict(tmp);
  fs.rmSync(tmp, { recursive: true });
  return pending === null;
})());

console.log(`\n=== state.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
