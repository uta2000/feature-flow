// skills/consult-codex/scripts/build-brief.js
'use strict';

const MAX_BRIEF_BYTES = 12 * 1024;
const TRUNCATION_MARKER = '\n\n… [truncated to fit 12 KB cap]';

function formatAttempts(attempts) {
  if (!attempts || attempts.length === 0) {
    return 'Nothing yet — this is a proactive review.';
  }
  return attempts.map(a =>
    `- **${a.when}** — task: ${a.task}\n  approach: ${a.approach}\n  result: ${a.result}`
  ).join('\n');
}

function truncate(brief) {
  if (Buffer.byteLength(brief, 'utf8') <= MAX_BRIEF_BYTES) return brief;
  const budget = MAX_BRIEF_BYTES - Buffer.byteLength(TRUNCATION_MARKER, 'utf8');
  let sliced = Buffer.from(brief, 'utf8').subarray(0, budget).toString('utf8');
  // If the slice landed mid-codepoint, Node substitutes U+FFFD. Strip it so
  // the resulting brief is at most MAX_BRIEF_BYTES bytes (rather than +1 or +2).
  if (sliced.endsWith('\uFFFD')) sliced = sliced.slice(0, -1);
  return sliced + TRUNCATION_MARKER;
}

function buildBrief({ mode, state, goal, currentState, signals, question }) {
  const feature = state.feature || '<unknown feature>';
  const worktree = state.worktree || '<unknown worktree>';
  const attempts = formatAttempts(state.attempts_log);

  const brief = [
    `# Feature-flow consultation — mode: ${mode}`,
    '',
    '## Feature',
    feature,
    '',
    '## Goal',
    goal,
    '',
    '## Current state',
    currentState,
    '',
    "## What's already been tried",
    attempts,
    '',
    '## Signals',
    signals || 'N/A',
    '',
    '## What I need from you',
    question,
    '',
    '## Constraints',
    `- You have read-only access to the worktree at ${worktree}`,
    '- Do NOT suggest any approach listed in "What\'s already been tried"',
    '- If you think the goal itself is wrong, say so explicitly and briefly',
    '- Keep your response under 400 words unless complexity truly demands more',
    '- Structure your response as: (1) diagnosis, (2) recommendation, (3) confidence (high/medium/low)',
    ''
  ].join('\n');

  return truncate(brief);
}

module.exports = buildBrief;
module.exports.MAX_BRIEF_BYTES = MAX_BRIEF_BYTES;
