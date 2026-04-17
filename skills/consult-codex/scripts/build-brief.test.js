#!/usr/bin/env node
'use strict';

const buildBrief = require('./build-brief');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

console.log('=== build-brief.js ===');

const baseState = {
  feature: 'user notifications',
  worktree: '/abs/path',
  attempts_log: []
};

assert('renders all required sections', (() => {
  const brief = buildBrief({
    mode: 'review-design',
    state: baseState,
    goal: 'Design a notification system',
    currentState: 'Full design doc text here',
    signals: 'N/A',
    question: 'Flag ambiguity.'
  });
  return brief.includes('# Feature-flow consultation — mode: review-design') &&
         brief.includes('## Feature') &&
         brief.includes('## Goal') &&
         brief.includes('## Current state') &&
         brief.includes("## What's already been tried") &&
         brief.includes('## Signals') &&
         brief.includes('## What I need from you') &&
         brief.includes('## Constraints') &&
         brief.includes('Design a notification system') &&
         brief.includes('Flag ambiguity.');
})());

assert('renders empty attempts_log as "Nothing yet"', (() => {
  const brief = buildBrief({
    mode: 'review-design', state: baseState, goal: 'g', currentState: 'cs',
    signals: 'none', question: 'q'
  });
  return brief.includes('Nothing yet — this is a proactive review.');
})());

assert('renders non-empty attempts_log entries', (() => {
  const state = { ...baseState, attempts_log: [
    { when: '2026-04-14T20:00:00Z', task: 'store notifs', approach: 'jsonb column', result: 'migration failed' }
  ]};
  const brief = buildBrief({
    mode: 'stuck', state, goal: 'g', currentState: 'cs', signals: 's', question: 'q'
  });
  return brief.includes('jsonb column') && brief.includes('migration failed');
})());

assert('truncates to 12 KB with marker (ascii input)', (() => {
  const hugeCurrent = 'x'.repeat(20000);
  const brief = buildBrief({
    mode: 'review-design', state: baseState, goal: 'g', currentState: hugeCurrent,
    signals: 's', question: 'q'
  });
  return Buffer.byteLength(brief, 'utf8') <= 12288 && brief.includes('[truncated');
})());

assert('truncates to 12 KB respecting utf-8 codepoint boundaries', (() => {
  // Each '日' is 3 bytes — repeating produces a string whose byte boundary
  // falls mid-codepoint at most byte budgets, exercising the U+FFFD strip path.
  const hugeCurrent = '日'.repeat(20000);
  const brief = buildBrief({
    mode: 'review-design', state: baseState, goal: 'g', currentState: hugeCurrent,
    signals: 's', question: 'q'
  });
  return Buffer.byteLength(brief, 'utf8') <= 12288 &&
         brief.includes('[truncated') &&
         !brief.includes('\uFFFD');
})());

assert('constraint block lists all five constraints', (() => {
  const brief = buildBrief({
    mode: 'stuck', state: baseState, goal: 'g', currentState: 'cs',
    signals: 's', question: 'q'
  });
  return brief.includes('You have read-only access') &&
         brief.includes("Do NOT suggest any approach listed") &&
         brief.includes('If you think the goal itself is wrong') &&
         brief.includes('under 400 words') &&
         brief.includes('(1) diagnosis, (2) recommendation, (3) confidence');
})());

console.log(`\n=== build-brief.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
