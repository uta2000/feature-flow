'use strict';

const fs = require('fs');
const path = require('path');

const MAX_DOC_BYTES = 10 * 1024;
const TRUNCATION_MARKER = '\n\n… [truncated to fit 10 KB cap]';

function loadDoc(worktreeRoot, docPath) {
  const abs = path.isAbsolute(docPath) ? docPath : path.join(worktreeRoot, docPath);
  const resolvedAbs = path.resolve(abs);
  const resolvedRoot = path.resolve(worktreeRoot);
  if (resolvedAbs !== resolvedRoot && !resolvedAbs.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`design doc path ${docPath} resolves outside worktree (${resolvedAbs}); refusing to read`);
  }
  if (!fs.existsSync(resolvedAbs)) {
    throw new Error(`design doc not found at ${resolvedAbs}`);
  }
  const raw = fs.readFileSync(resolvedAbs, 'utf8');
  if (Buffer.byteLength(raw, 'utf8') <= MAX_DOC_BYTES) return raw;
  const budget = MAX_DOC_BYTES - Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
  let sliced = Buffer.from(raw, 'utf8').subarray(0, budget).toString('utf8');
  if (sliced.endsWith('\uFFFD')) sliced = sliced.slice(0, -1);
  return sliced + TRUNCATION_MARKER;
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
