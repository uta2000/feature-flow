// skills/consult-codex/scripts/consult.js
'use strict';

const fs = require('fs');
const path = require('path');
const state = require('./state');
const config = require('./config');
const buildBrief = require('./build-brief');
const resolveModel = require('./resolve-model');
const record = require('./record-exchange');

const PROACTIVE_MODES = new Set(['review-design', 'review-plan', 'review-code']);
const REACTIVE_MODES = new Set(['stuck']);
const MODE_TO_BUDGET_KEY = {
  'review-design': 'design_doc',
  'review-plan':   'plan_criteria',
  'review-code':   'pre_harden'
};

function isValidMode(m) {
  return PROACTIVE_MODES.has(m) || REACTIVE_MODES.has(m);
}

// --------------------------------------------------------------------------
// Subcommand: start
// --------------------------------------------------------------------------

async function start({ worktreeRoot, feature, mode, signalKey, introspect }) {
  const cfg = config.load(worktreeRoot);

  if (!cfg.enabled) {
    return { status: 'disabled', message: 'codex is disabled (enabled: false in .feature-flow.yml)' };
  }

  if (!isValidMode(mode)) {
    return { status: 'error', message: `unknown mode: ${mode}` };
  }

  // Proactive budget check — READ ONLY, does not touch state
  if (PROACTIVE_MODES.has(mode)) {
    const stateFilePath = state.statePath(worktreeRoot);
    if (fs.existsSync(stateFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        const key = MODE_TO_BUDGET_KEY[mode];
        if (existing.budget && existing.budget.proactive && existing.budget.proactive[key] >= 1) {
          return { status: 'skipped', reason: 'budget_exhausted', message: `proactive ${mode} already ran this session` };
        }
      } catch {
        console.error('[consult-codex] state file unreadable in start; budget check skipped, recovery deferred to record-response');
      }
    }
  }

  // Reactive escape-hatch check (stuck mode only)
  if (REACTIVE_MODES.has(mode) && signalKey) {
    const stateFilePath = state.statePath(worktreeRoot);
    if (fs.existsSync(stateFilePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
        const hatch = (existing.escape_hatch_state || {})[signalKey];
        if (hatch && hatch.last_consulted_at) {
          // v1: default 30-minute window, not yet configurable in this task
          const windowMs = 30 * 60 * 1000;
          if (Date.now() - new Date(hatch.last_consulted_at).getTime() < windowMs) {
            return { status: 'skipped', reason: 'escape_hatch_active', message: `signal ${signalKey} is within the escape-hatch window` };
          }
        }
      } catch {
        console.error('[consult-codex] state file unreadable in start; escape-hatch check skipped, recovery deferred to record-response');
      }
    }
  }

  // Resolve model
  const resolved = await resolveModel(cfg, introspect || (async () => []));
  if (!resolved.model) {
    return { status: 'skipped', reason: resolved.reason || 'model_unresolvable', message: 'no codex model available' };
  }

  // Build brief via per-mode module
  const modeModule = require(`./modes/${mode}`);
  // Load a transient state snapshot for the brief builder without writing.
  // We read fields like design_doc_path and attempts_log from the persisted
  // state file if it exists; the integrating skill (e.g. design-document) is
  // responsible for calling state.setMetadata before invoking consult-codex.
  const transientState = { feature, worktree: worktreeRoot, attempts_log: [] };
  const stateFilePath = state.statePath(worktreeRoot);
  if (fs.existsSync(stateFilePath)) {
    try {
      const persisted = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
      if (persisted.design_doc_path) transientState.design_doc_path = persisted.design_doc_path;
      if (persisted.plan_file_path) transientState.plan_file_path = persisted.plan_file_path;
      if (Array.isArray(persisted.attempts_log)) transientState.attempts_log = persisted.attempts_log;
    } catch {
      console.error('[consult-codex] state file unreadable when building brief; using defaults');
    }
  }
  const inputs = modeModule.buildInputs({ worktreeRoot, state: transientState });
  const brief = buildBrief({
    mode,
    state: transientState,
    goal: inputs.goal,
    currentState: inputs.currentState,
    signals: inputs.signals,
    question: inputs.question
  });

  return {
    status: 'ready',
    mode,
    brief,
    model: resolved.model,
    timeout_ms: (cfg.timeout_seconds || 180) * 1000,
    worktree: worktreeRoot,
    signal_key: signalKey || null
  };
}

// --------------------------------------------------------------------------
// Subcommand: record-response
// --------------------------------------------------------------------------

async function recordResponse({ worktreeRoot, sessionId, feature, mode, signalKey, mcpResult }) {
  if (!isValidMode(mode)) {
    return { status: 'error', message: `unknown mode: ${mode}` };
  }

  state.load(worktreeRoot, sessionId, feature);

  const strict = REACTIVE_MODES.has(mode);
  const isError = mcpResult && mcpResult.error;

  if (isError) {
    const { reason, detail } = mcpResult.error;
    const entry = record.recordConsultation(worktreeRoot, {
      mode,
      strict,
      trigger: strict ? 'reactive' : 'proactive',
      signal_key: signalKey || null,
      brief: '(not recorded — call failed before brief was consumed)',
      codex_response: null,
      codex_thread_id: null
    });
    // Override outcome on the freshly appended entry
    state.setVerdict(worktreeRoot, entry.id, {
      decision: null,
      reason: null,
      outcome: `skipped:${reason}`
    });
    // Reset verdict back to null (skipped entries are not verdict-pending)
    const s = state.load(worktreeRoot, sessionId, feature);
    const target = s.consultations.find(c => c.id === entry.id);
    target.verdict = null;
    target.verdict_reason = null;
    state.save(worktreeRoot, s);

    return {
      status: 'recorded_skip',
      consultation_id: entry.id,
      reason,
      message: `Consultation ${entry.id} skipped: ${reason} — ${detail || ''}`
    };
  }

  // Success path
  const { threadId, content } = mcpResult;
  const entry = record.recordConsultation(worktreeRoot, {
    mode,
    strict,
    trigger: strict ? 'reactive' : 'proactive',
    signal_key: signalKey || null,
    brief: '(brief from start; record-response does not re-emit it)',
    codex_response: content,
    codex_thread_id: threadId
  });

  // Increment budget
  if (PROACTIVE_MODES.has(mode)) {
    const s = state.load(worktreeRoot, sessionId, feature);
    const key = MODE_TO_BUDGET_KEY[mode];
    s.budget.proactive[key] += 1;
    state.save(worktreeRoot, s);
  } else if (REACTIVE_MODES.has(mode)) {
    const s = state.load(worktreeRoot, sessionId, feature);
    s.budget.reactive.used += 1;
    if (signalKey) {
      s.escape_hatch_state[signalKey] = { last_consulted_at: new Date().toISOString() };
    }
    state.save(worktreeRoot, s);
  }

  return buildReturnMessage(entry, strict, content);
}

// --------------------------------------------------------------------------
// Subcommand: verdict
// --------------------------------------------------------------------------

async function verdict({ worktreeRoot, id, decision, reason }) {
  if (!id || !decision) {
    return { status: 'error', message: 'verdict requires --id and --decision' };
  }
  if (decision !== 'accept' && decision !== 'reject') {
    return { status: 'error', message: 'decision must be accept or reject' };
  }
  const outcome = decision === 'accept' ? 'applied' : 'rejected';
  record.recordVerdict(worktreeRoot, id, { decision, reason: reason || '', outcome });
  return {
    status: 'verdict_recorded',
    consultation_id: id,
    message: `Consultation ${id} verdict recorded: ${decision} — ${reason || ''}`
  };
}

// --------------------------------------------------------------------------
// Return message builder (shared by recordResponse)
// --------------------------------------------------------------------------

function buildReturnMessage(entry, strict, codexContent) {
  if (strict) {
    return {
      status: 'consulted',
      tier: 'strict',
      consultation_id: entry.id,
      message: [
        `# Codex consultation ${entry.id} — mode: ${entry.mode}`,
        entry.signal_key ? `# Signal: ${entry.signal_key}` : '',
        '# Enforcement: STRICT (PreToolUse block until verdict is recorded)',
        '',
        '## Codex response',
        codexContent,
        '',
        '## REQUIRED next step',
        'The next Skill call you make MUST be the verdict call for this consultation.',
        'All other Skill invocations will be blocked by the verdict-gate PreToolUse hook',
        'until this is recorded.',
        '',
        `    Skill(skill: "feature-flow:consult-codex", args: "verdict --id ${entry.id} --decision <accept|reject> --reason <short text>")`
      ].filter(Boolean).join('\n')
    };
  }
  return {
    status: 'consulted',
    tier: 'soft',
    consultation_id: entry.id,
    message: [
      `# Codex consultation ${entry.id} — mode: ${entry.mode}`,
      '# Enforcement: SOFT (single-shot reminder; missing verdict surfaces as <not recorded> in PR metadata)',
      '',
      '## Codex response',
      codexContent,
      '',
      '## Recommended next step',
      'To record your verdict, paste this one-liner (this reminder will not repeat):',
      '',
      `    Skill(skill: "feature-flow:consult-codex", args: "verdict --id ${entry.id} --decision <accept|reject> --reason <short text>")`,
      '',
      'If you skip this, the consultation will be logged with verdict: <not recorded>.'
    ].join('\n')
  };
}

// --------------------------------------------------------------------------
// CLI wrapper
// --------------------------------------------------------------------------

async function mainCli() {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const worktreeRoot = process.env.FEATURE_FLOW_WORKTREE || process.cwd();
  const sessionId = process.env.FEATURE_FLOW_SESSION_ID || 'cli-session';
  const feature = process.env.FEATURE_FLOW_FEATURE || path.basename(worktreeRoot);

  function parseFlags(tokens) {
    const out = {};
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].startsWith('--')) {
        const key = tokens[i].slice(2);
        const valParts = [];
        while (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
          valParts.push(tokens[++i]);
        }
        out[key] = valParts.join(' ');
      }
    }
    return out;
  }

  const MAX_STDIN_BYTES = 2 * 1024 * 1024; // 2 MB cap on Codex response payload

  function readStdin() {
    return new Promise((resolve, reject) => {
      if (process.stdin.isTTY) return resolve('');
      let data = '';
      let bytes = 0;
      process.stdin.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_STDIN_BYTES) {
          process.stdin.destroy();
          reject(new Error(`stdin exceeded ${MAX_STDIN_BYTES} bytes — refusing to buffer further`));
          return;
        }
        data += chunk;
      });
      process.stdin.on('end', () => resolve(data));
      process.stdin.on('error', err => reject(err));
    });
  }

  let result;
  if (sub === 'start') {
    const flags = parseFlags(argv.slice(1));
    const introspect = process.env.CODEX_ADVERTISED_MODELS
      ? async () => process.env.CODEX_ADVERTISED_MODELS.split(',').map(s => s.trim()).filter(Boolean)
      : async () => [];
    result = await start({
      worktreeRoot, sessionId, feature,
      mode: flags.mode,
      signalKey: flags['signal-key'] || null,
      introspect
    });
  } else if (sub === 'record-response') {
    const flags = parseFlags(argv.slice(1));
    let mcpResult;
    try {
      const stdin = await readStdin();
      try { mcpResult = JSON.parse(stdin); }
      catch { mcpResult = { error: { reason: 'codex_call_failed', detail: 'could not parse stdin JSON' } }; }
    } catch (err) {
      mcpResult = { error: { reason: 'codex_call_failed', detail: err.message } };
    }
    result = await recordResponse({
      worktreeRoot, sessionId, feature,
      mode: flags.mode,
      signalKey: flags['signal-key'] || null,
      mcpResult
    });
  } else if (sub === 'verdict') {
    const flags = parseFlags(argv.slice(1));
    result = await verdict({
      worktreeRoot,
      id: flags.id,
      decision: flags.decision,
      reason: flags.reason
    });
  } else {
    result = { status: 'error', message: `unknown subcommand: ${sub || '<none>'}` };
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'error' ? 1 : 0);
}

if (require.main === module) {
  mainCli().catch(err => {
    console.log(JSON.stringify({ status: 'error', message: err.message }));
    process.exit(1);
  });
}

module.exports = { start, recordResponse, verdict };
