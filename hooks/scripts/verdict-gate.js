#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { readHookInput } = require('./lib/read-hook-input');

function loadState(cwd) {
  const p = path.join(cwd, '.feature-flow', 'session-state.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (err) {
    try { process.stderr.write(`[verdict-gate] state file unreadable: ${err && err.message}; fail-open\n`); } catch (_) { /* stderr unavailable */ }
    return null;
  }
}

function isVerdictCallForPending(args, pendingId) {
  if (typeof args !== 'string') return false;
  const trimmed = args.trim();
  if (!/^verdict\b/.test(trimmed)) return false;
  const match = /--id[=\s]+(\S+)/.exec(trimmed);
  return match && match[1] === pendingId;
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolName = payload.tool_name || '';
  if (toolName !== 'Skill') process.exit(0);

  const state = loadState(process.cwd());
  if (!state || !Array.isArray(state.consultations)) process.exit(0);

  const pending = state.consultations.find(
    c => c && c.strict === true && c.verdict === null
  );
  if (!pending) process.exit(0);

  const toolInput = payload.tool_input || {};
  const skillName = toolInput.skill || '';
  const args = toolInput.args || '';

  if (skillName === 'feature-flow:consult-codex' && isVerdictCallForPending(args, pending.id)) {
    process.exit(0);
  }

  const signalStr = pending.signal_key ? ` (signal: ${pending.signal_key})` : '';
  const reason = [
    `Consultation ${pending.id} (mode: ${pending.mode}${signalStr}) requires a verdict before any other skill call.`,
    'This is a sequencing block, not a prohibition — record the verdict and your next call can proceed.',
    '',
    `Invoke: Skill(skill: "feature-flow:consult-codex", args: "verdict --id ${pending.id} --decision <accept|reject> --reason <short text>")`,
    '',
    '- accept: you will apply codex\'s recommendation',
    '- reject: you will not apply it (reason must reference what\'s already been tried)'
  ].join('\n');

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

try { main(); } catch (err) {
  try { process.stderr.write('[verdict-gate] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
