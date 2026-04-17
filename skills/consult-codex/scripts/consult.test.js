#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
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
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-consult-')); }
function writeYml(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

async function main() {
  console.log('=== consult.js ===');

  // --- start subcommand ---

  await assertAsync(
    'start: refuses when codex.enabled is false',
    consult.start({
      worktreeRoot: (() => { const t = mkTmp(); writeYml(t, 'codex:\n  enabled: false\n'); return t; })(),
      sessionId: 's', feature: 'f',
      mode: 'review-design',
      introspect: async () => []
    }).then(r => r.status === 'disabled' && r.message.includes('enabled: false'))
  );

  await assertAsync(
    'start: returns ready JSON with brief and model on success',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'd.md'), '# Design doc\n\nSome content.\n');
      const state = require('./state');
      state.load(tmp, 's', 'f');
      state.setMetadata(tmp, { design_doc_path: 'docs/plans/d.md' });
      const r = await consult.start({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design',
        introspect: async () => []
      });
      fs.rmSync(tmp, { recursive: true });
      return r.status === 'ready' &&
             typeof r.brief === 'string' && r.brief.length > 0 &&
             r.model === 'gpt-5.2' &&
             r.mode === 'review-design' &&
             typeof r.timeout_ms === 'number';
    })()
  );

  await assertAsync(
    'start: returns skipped:model_unresolvable when model unset and no introspection',
    consult.start({
      worktreeRoot: (() => { const t = mkTmp(); writeYml(t, 'codex:\n  enabled: true\n'); return t; })(),
      sessionId: 's', feature: 'f',
      mode: 'review-design',
      introspect: async () => []
    }).then(r => r.status === 'skipped' && r.reason === 'model_unresolvable')
  );

  await assertAsync(
    'start: returns skipped:budget_exhausted after recordResponse used the proactive slot',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design', signalKey: null,
        mcpResult: { threadId: 't', content: 'first response' }
      });
      const r = await consult.start({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design',
        introspect: async () => []
      });
      fs.rmSync(tmp, { recursive: true });
      return r.status === 'skipped' &&
             r.reason === 'budget_exhausted' &&
             r.message.includes('review-design');
    })()
  );

  await assertAsync(
    'start: does NOT modify session-state.json',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'd.md'), '# Design doc\n');
      const state = require('./state');
      state.load(tmp, 's', 'f');
      state.setMetadata(tmp, { design_doc_path: 'docs/plans/d.md' });
      const stateBefore = fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8');
      await consult.start({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design',
        introspect: async () => []
      });
      const stateAfter = fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8');
      fs.rmSync(tmp, { recursive: true });
      return stateBefore === stateAfter;
    })()
  );

  // --- record-response subcommand ---

  await assertAsync(
    'record-response: success path appends consultation and increments budget',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      const result = await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design',
        signalKey: null,
        mcpResult: { threadId: 'thread-1', content: 'diag\nrec\nconfidence: high' }
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return result.status === 'consulted' &&
             result.tier === 'soft' &&
             result.consultation_id === 'c1' &&
             result.message.includes('verdict --id c1') &&
             stateFile.consultations.length === 1 &&
             stateFile.consultations[0].verdict === null &&
             stateFile.budget.proactive.design_doc === 1;
    })()
  );

  await assertAsync(
    'record-response: error path records skipped consultation with reason',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      const result = await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design',
        signalKey: null,
        mcpResult: { error: { reason: 'model_auth_rejected', detail: 'not supported' } }
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return result.status === 'recorded_skip' &&
             result.reason === 'model_auth_rejected' &&
             stateFile.consultations[0].outcome === 'skipped:model_auth_rejected' &&
             stateFile.consultations[0].codex_response === null;
    })()
  );

  await assertAsync(
    'record-response: error path persists error_detail in state',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design', signalKey: null,
        mcpResult: { error: { reason: 'codex_call_failed', detail: 'connection refused after 30s' } }
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return stateFile.consultations[0].error_detail === 'connection refused after 30s';
    })()
  );

  await assertAsync(
    'record-response: reactive stuck mode records strict consultation with signal_key',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      const result = await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'stuck',
        signalKey: 'test:user_notifications_creates_record',
        mcpResult: { threadId: 'thread-2', content: 'diagnosis' }
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return result.tier === 'strict' &&
             stateFile.consultations[0].strict === true &&
             stateFile.consultations[0].signal_key === 'test:user_notifications_creates_record' &&
             stateFile.budget.reactive.used === 1;
    })()
  );

  // --- verdict subcommand ---

  await assertAsync(
    'verdict: updates consultation verdict and reason',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 's', feature: 'f',
        mode: 'review-design', signalKey: null,
        mcpResult: { threadId: 't', content: 'x' }
      });
      const r = await consult.verdict({
        worktreeRoot: tmp,
        id: 'c1',
        decision: 'accept',
        reason: 'matched the issue'
      });
      const stateFile = JSON.parse(fs.readFileSync(path.join(tmp, '.feature-flow', 'session-state.json'), 'utf8'));
      fs.rmSync(tmp, { recursive: true });
      return r.status === 'verdict_recorded' &&
             stateFile.consultations[0].verdict === 'accept' &&
             stateFile.consultations[0].verdict_reason === 'matched the issue' &&
             stateFile.consultations[0].outcome === 'applied';
    })()
  );

  await assertAsync(
    'verdict: errors when --id or --decision missing',
    (async () => {
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      const r = await consult.verdict({ worktreeRoot: tmp, id: 'c1', decision: null, reason: 'x' });
      fs.rmSync(tmp, { recursive: true });
      return r.status === 'error' && r.message.includes('--decision');
    })()
  );

  await assertAsync(
    'start: rejects mode containing path traversal',
    consult.start({
      worktreeRoot: (() => { const t = mkTmp(); writeYml(t, 'codex:\n  enabled: true\n  model: gpt-5.2\n'); return t; })(),
      sessionId: 's', feature: 'f',
      mode: '../../../etc/passwd',
      introspect: async () => []
    }).then(r => r.status === 'error' && r.message.includes('unknown mode'))
  );

  await assertAsync(
    'CLI: verdict subcommand returns valid JSON via execSync',
    (async () => {
      const { execSync } = require('child_process');
      const tmp = mkTmp();
      writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
      fs.mkdirSync(path.join(tmp, 'docs', 'plans'), { recursive: true });
      fs.writeFileSync(path.join(tmp, 'docs', 'plans', 'd.md'), '# D\n');
      const stateMod = require('./state');
      stateMod.load(tmp, 'cli-session', path.basename(tmp));
      stateMod.setMetadata(tmp, { design_doc_path: 'docs/plans/d.md' });
      // First create a consultation via record-response so verdict has something to update
      await consult.recordResponse({
        worktreeRoot: tmp, sessionId: 'cli-session', feature: path.basename(tmp),
        mode: 'review-design', signalKey: null,
        mcpResult: { threadId: 't', content: 'x' }
      });
      // Now invoke verdict via the CLI
      const SCRIPT = path.resolve(__dirname, 'consult.js');
      const out = execSync(
        `FEATURE_FLOW_WORKTREE=${tmp} FEATURE_FLOW_SESSION_ID=cli-session FEATURE_FLOW_FEATURE=${path.basename(tmp)} node ${SCRIPT} verdict --id c1 --decision accept --reason cli-test`,
        { encoding: 'utf8', shell: '/bin/bash' }
      );
      fs.rmSync(tmp, { recursive: true });
      const parsed = JSON.parse(out);
      return parsed.status === 'verdict_recorded' && parsed.consultation_id === 'c1';
    })()
  );

  console.log(`\n=== consult.js: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
