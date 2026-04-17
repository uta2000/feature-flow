'use strict';

const fs = require('fs');
const path = require('path');

const MAX_DOC_BYTES = 10 * 1024;
const TRUNCATION_MARKER = '\n\n… [truncated to fit 10 KB cap]';

function loadDoc(worktreeRoot, docPath) {
  const abs = path.isAbsolute(docPath) ? docPath : path.join(worktreeRoot, docPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`design doc not found at ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') <= MAX_DOC_BYTES) return raw;
  const budget = MAX_DOC_BYTES - Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
  return Buffer.from(raw, 'utf8').subarray(0, budget).toString('utf8') + TRUNCATION_MARKER;
}

function buildInputs({ worktreeRoot, state }) {
  if (!state.design_doc_path) {
    throw new Error('review-design requires state.design_doc_path to be set — the integrating skill should call state.setMetadata({design_doc_path: ...}) before invoking consult-codex.');
  }
  const doc = loadDoc(worktreeRoot, state.design_doc_path);
  return {
    goal: `Review the design document for feature "${state.feature}" before we move to verification and implementation. The design doc is at ${state.design_doc_path}.`,
    currentState: doc,
    signals: 'N/A — proactive design review',
    question: 'Identify unstated assumptions, missing edge cases, internal contradictions, and vague requirements in this design. If anything is actually ambiguous or underspecified, flag it with the section name.'
  };
}

module.exports = { buildInputs };
