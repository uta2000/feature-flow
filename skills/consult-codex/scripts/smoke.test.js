#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const state = require('./state');
const consult = require('./consult');

let passed = 0, failed = 0;
async function assertAsync(name, promise) {
  try {
    const result = await promise;
    if (result) { console.log(`  ok — ${name}`); passed++; }
    else { console.log(`  FAIL — ${name}`); failed++; }
  } catch (e) {
    console.log(`  FAIL — ${name} (threw: ${e.message})`); failed++;
  }
}

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-smoke-')); }

const FAKE_CODEX_RESPONSE = [
  'Diagnosis: The design does not specify how session state is garbage-collected across worktrees.',
  'Recommendation: Add an explicit "garbage collection on SessionStart" step to the Architecture section.',
  'Confidence: high'
].join('\n');

async function main() {
  console.log('=== smoke test — three-phase review-design end-to-end ===');

  const tmp = mkTmp();
  const tmp2 = mkTmp();

  try {
  // Setup: .feature-flow.yml + design doc + session state with design_doc_path
  fs.writeFileSync(
    path.join(tmp, '.feature-flow.yml'),
    'codex:\n  enabled: true\n  model: gpt-5.2\n  proactive_reviews:\n    design_doc: true\n'
  );
  fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'docs', 'plans', 'test-feature.md'),
    '# Test Feature\n\n## Summary\nA test.\n\n## Architecture\nSome thing.\n'
  );
  state.load(tmp, 'smoke-session', 'test-feature');
  state.setMetadata(tmp, { design_doc_path: 'docs/plans/test-feature.md' });

  // === Phase 1: start ===
  const startResult = await consult.start({
    worktreeRoot: tmp,
    sessionId: 'smoke-session',
    feature: 'test-feature',
    mode: 'review-design',
    signalKey: null,
    introspect: async () => []
  });

  await assertAsync(
    'Phase 1 start returns status: ready',
    Promise.resolve(startResult.status === 'ready')
  );

  await assertAsync(
    'Phase 1 start returns brief, model, timeout_ms, worktree',
    Promise.resolve(
      typeof startResult.brief === 'string' && startResult.brief.length > 0 &&
      startResult.model === 'gpt-5.2' &&
      typeof startResult.timeout_ms === 'number' &&
      startResult.worktree === tmp
    )
  );

  await assertAsync(
    'Phase 1 does NOT create consultations in state',
    Promise.resolve((() => {
      const s = state.load(tmp, 'smoke-session', 'test-feature');
      return s.consultations.length === 0;
    })())
  );

  // === Phase 2: simulate Claude calling mcp__codex__codex (we use a canned result) ===
  const simulatedMcpResult = { threadId: 'smoke-thread-1', content: FAKE_CODEX_RESPONSE };

  // === Phase 3: record-response ===
  const recordResult = await consult.recordResponse({
    worktreeRoot: tmp,
    sessionId: 'smoke-session',
    feature: 'test-feature',
    mode: 'review-design',
    signalKey: null,
    mcpResult: simulatedMcpResult
  });

  await assertAsync(
    'Phase 3 returns consulted + soft tier + consultation_id c1',
    Promise.resolve(
      recordResult.status === 'consulted' &&
      recordResult.tier === 'soft' &&
      recordResult.consultation_id === 'c1'
    )
  );

  await assertAsync(
    'Phase 3 return message includes verdict one-liner',
    Promise.resolve(recordResult.message.includes('verdict --id c1'))
  );

  await assertAsync(
    'state has one consultation with verdict: null after Phase 3',
    Promise.resolve((() => {
      const s = state.load(tmp, 'smoke-session', 'test-feature');
      return s.consultations.length === 1 &&
             s.consultations[0].verdict === null &&
             s.consultations[0].codex_response === FAKE_CODEX_RESPONSE &&
             s.consultations[0].codex_thread_id === 'smoke-thread-1';
    })())
  );

  await assertAsync(
    'codex-log.md exists with pending section after Phase 3',
    Promise.resolve((() => {
      const log = fs.readFileSync(path.join(tmp, '.feature-flow', 'codex-log.md'), 'utf8');
      return log.includes('## Consultation c1') && log.includes('_pending_');
    })())
  );

  await assertAsync(
    'budget.proactive.design_doc is 1 after Phase 3',
    Promise.resolve(state.load(tmp, 'smoke-session', 'test-feature').budget.proactive.design_doc === 1)
  );

  // === Phase 4: verdict ===
  const verdictResult = await consult.verdict({
    worktreeRoot: tmp,
    id: 'c1',
    decision: 'accept',
    reason: 'added GC step to Architecture'
  });

  await assertAsync(
    'Phase 4 verdict returns verdict_recorded',
    Promise.resolve(verdictResult.status === 'verdict_recorded')
  );

  await assertAsync(
    'state has verdict accept after Phase 4',
    Promise.resolve((() => {
      const s = state.load(tmp, 'smoke-session', 'test-feature');
      return s.consultations[0].verdict === 'accept' &&
             s.consultations[0].verdict_reason === 'added GC step to Architecture' &&
             s.consultations[0].outcome === 'applied';
    })())
  );

  await assertAsync(
    'codex-log.md has final VERDICT line and no pending marker',
    Promise.resolve((() => {
      const log = fs.readFileSync(path.join(tmp, '.feature-flow', 'codex-log.md'), 'utf8');
      return log.includes('**VERDICT:** accept') && !log.includes('_pending_');
    })())
  );

  // === Budget exhaustion: second Phase 1 start refuses ===
  const secondStart = await consult.start({
    worktreeRoot: tmp,
    sessionId: 'smoke-session',
    feature: 'test-feature',
    mode: 'review-design',
    signalKey: null,
    introspect: async () => []
  });

  await assertAsync(
    'second start returns skipped: budget_exhausted',
    Promise.resolve(secondStart.status === 'skipped' && secondStart.reason === 'budget_exhausted')
  );

  // === Error path: Phase 3 records skipped consultation when MCP fails ===
  // Use a fresh tmp so budget is clean
  fs.writeFileSync(
    path.join(tmp2, '.feature-flow.yml'),
    'codex:\n  enabled: true\n  model: gpt-5.2\n'
  );
  state.load(tmp2, 'smoke-session-2', 'test-feature');

  const errorRecord = await consult.recordResponse({
    worktreeRoot: tmp2,
    sessionId: 'smoke-session-2',
    feature: 'test-feature',
    mode: 'review-design',
    signalKey: null,
    mcpResult: { error: { reason: 'model_auth_rejected', detail: 'model not supported' } }
  });

  await assertAsync(
    'error path returns recorded_skip with reason',
    Promise.resolve(errorRecord.status === 'recorded_skip' && errorRecord.reason === 'model_auth_rejected')
  );

  await assertAsync(
    'error path leaves consultation with null codex_response',
    Promise.resolve((() => {
      const s = state.load(tmp2, 'smoke-session-2', 'test-feature');
      return s.consultations[0].codex_response === null &&
             s.consultations[0].outcome === 'skipped:model_auth_rejected';
    })())
  );

  } finally {
    try { fs.rmSync(tmp, { recursive: true }); } catch (_) { /* already cleaned */ }
    try { fs.rmSync(tmp2, { recursive: true }); } catch (_) { /* already cleaned */ }
  }

  console.log(`\n=== smoke: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
