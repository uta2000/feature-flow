'use strict';

const fs = require('fs');
const path = require('path');

const STATE_DIR = '.feature-flow';
const STATE_FILE = 'session-state.json';

function statePath(worktreeRoot) {
  return path.join(worktreeRoot, STATE_DIR, STATE_FILE);
}

function ensureDir(worktreeRoot) {
  const dir = path.join(worktreeRoot, STATE_DIR);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function freshState(sessionId, feature) {
  return {
    session_id: sessionId,
    feature,
    worktree: null,
    started_at: new Date().toISOString(),
    mode: 'interactive',
    design_doc_path: null,
    plan_file_path: null,
    signals: {
      failing_tests: {},
      recurring_errors: {},
      file_edits: {},
      verify_criteria_fails: {},
      quality_gate_fails: {}
    },
    escape_hatch_state: {},
    attempts_log: [],
    budget: {
      proactive: { design_doc: 0, plan_criteria: 0, pre_harden: 0 },
      reactive: { used: 0, cap: 3 }
    },
    consultations: []
  };
}

function load(worktreeRoot, sessionId, feature) {
  ensureDir(worktreeRoot);
  const p = statePath(worktreeRoot);
  if (!fs.existsSync(p)) {
    const fresh = freshState(sessionId, feature);
    save(worktreeRoot, fresh);
    return fresh;
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    const bak = `${p}.bak-${Date.now()}`;
    fs.renameSync(p, bak);
    const fresh = freshState(sessionId, feature);
    save(worktreeRoot, fresh);
    return fresh;
  }
  if (parsed.session_id !== sessionId) {
    const fresh = freshState(sessionId, feature);
    save(worktreeRoot, fresh);
    return fresh;
  }
  return parsed;
}

function save(worktreeRoot, state) {
  ensureDir(worktreeRoot);
  const p = statePath(worktreeRoot);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p);
}

function readOrThrow(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error('state not initialized — call load() first');
    }
    throw err;
  }
}

function setMetadata(worktreeRoot, patch) {
  const p = statePath(worktreeRoot);
  // Self-initialize when state is missing — the integrating skill (e.g. design-document)
  // calls setMetadata before any consult.js subcommand runs, so state may not exist yet.
  // We use env-var-derived defaults that match consult.js's CLI wrapper, so a subsequent
  // state.load with the same session id won't trigger GC.
  if (!fs.existsSync(p)) {
    const sessionId = process.env.FEATURE_FLOW_SESSION_ID || `auto-${Date.now()}`;
    const feature = process.env.FEATURE_FLOW_FEATURE || path.basename(worktreeRoot);
    save(worktreeRoot, freshState(sessionId, feature));
  }
  const current = readOrThrow(p);
  Object.assign(current, patch);
  save(worktreeRoot, current);
  return current;
}

function appendConsultation(worktreeRoot, partial) {
  const p = statePath(worktreeRoot);
  const current = readOrThrow(p);
  const id = `c${current.consultations.length + 1}`;
  const entry = {
    id,
    when: new Date().toISOString(),
    mode: partial.mode,
    trigger: partial.trigger || 'unknown',
    strict: Boolean(partial.strict),
    signal_key: partial.signal_key || null,
    codex_thread_id: partial.codex_thread_id || null,
    codex_response: partial.codex_response || null,
    verdict: null,
    verdict_reason: null,
    outcome: partial.outcome || 'pending_verdict',
    follow_up_edits: []
  };
  current.consultations.push(entry);
  save(worktreeRoot, current);
  return entry;
}

function setVerdict(worktreeRoot, id, { decision, reason, outcome }) {
  const p = statePath(worktreeRoot);
  const current = readOrThrow(p);
  const entry = current.consultations.find(c => c.id === id);
  if (!entry) throw new Error(`consultation ${id} not found`);
  entry.verdict = decision;
  entry.verdict_reason = reason;
  entry.outcome = outcome;
  save(worktreeRoot, current);
  return entry;
}

function findPendingStrict(worktreeRoot) {
  const p = statePath(worktreeRoot);
  if (!fs.existsSync(p)) return null;
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
  const pending = (parsed.consultations || []).find(
    c => c.strict === true && c.verdict === null
  );
  return pending || null;
}

module.exports = {
  load,
  save,
  setMetadata,
  appendConsultation,
  setVerdict,
  findPendingStrict,
  statePath
};
