'use strict';

const fs = require('fs');
const path = require('path');
const state = require('./state');

const LOG_FILE = path.join('.feature-flow', 'codex-log.md');
const PENDING_MARKER = '### Verdict\n_pending_';

function logPath(worktreeRoot) {
  return path.join(worktreeRoot, LOG_FILE);
}

function briefExcerpt(brief, maxLines = 8) {
  const text = typeof brief === 'string' ? brief : String(brief ?? '');
  return text.split('\n').slice(0, maxLines).map(l => `> ${l}`).join('\n');
}

function appendLogSection(worktreeRoot, entry) {
  const p = logPath(worktreeRoot);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const section = [
    '',
    `## Consultation ${entry.id} — ${entry.when} — mode: ${entry.mode}`,
    '',
    `**Trigger:** ${entry.trigger}`,
    `**Codex thread:** ${entry.codex_thread_id || 'n/a'}`,
    `**Strict:** ${entry.strict}`,
    '',
    '### Brief (excerpt)',
    entry.brief_excerpt,
    '',
    '### Codex response',
    `> ${(entry.codex_response || '').replace(/\n/g, '\n> ')}`,
    '',
    '### Verdict',
    '_pending_',
    '',
    '### Outcome',
    entry.outcome,
    '',
    '---',
    ''
  ].join('\n');
  fs.appendFileSync(p, section);
}

function rewritePendingVerdict(worktreeRoot, id, decision, reason) {
  const p = logPath(worktreeRoot);
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  const header = `## Consultation ${id} —`;
  const headerIdx = content.indexOf(header);
  if (headerIdx === -1) return;
  const pendingRegion = content.indexOf(PENDING_MARKER, headerIdx);
  if (pendingRegion === -1) return;
  const replacement = `### Verdict\n**VERDICT:** ${decision} — ${reason}`;
  const updated = content.slice(0, pendingRegion) +
                  replacement +
                  content.slice(pendingRegion + PENDING_MARKER.length);
  fs.writeFileSync(p, updated);
}

function recordConsultation(worktreeRoot, args) {
  const entry = state.appendConsultation(worktreeRoot, {
    mode: args.mode,
    trigger: args.trigger,
    strict: args.strict,
    signal_key: args.signal_key || null,
    codex_thread_id: args.codex_thread_id || null,
    codex_response: args.codex_response || null,
    outcome: 'pending_verdict'
  });
  appendLogSection(worktreeRoot, {
    ...entry,
    brief_excerpt: briefExcerpt(args.brief || '')
  });
  return entry;
}

function recordVerdict(worktreeRoot, id, { decision, reason, outcome }) {
  state.setVerdict(worktreeRoot, id, { decision, reason, outcome });
  rewritePendingVerdict(worktreeRoot, id, decision, reason);
}

module.exports = { recordConsultation, recordVerdict };
