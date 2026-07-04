#!/usr/bin/env node
'use strict';

const path = require('path');
const { execSync } = require('child_process');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}

const LIB_DIR = path.resolve(__dirname);
const RUN_CMD = `node -e "const {readHookInput}=require('./read-hook-input');process.stdout.write(JSON.stringify(readHookInput()))"`;

function run(input) {
  try {
    return execSync(RUN_CMD, { cwd: LIB_DIR, input, encoding: 'utf8' });
  } catch (err) {
    return err.stdout || '';
  }
}

console.log('=== lib/read-hook-input.js ===');

assert('parses valid JSON stdin and returns the object', (() => {
  const out = run(JSON.stringify({ tool_name: 'Write', tool_input: { file_path: '/tmp/x.ts' } }));
  const parsed = JSON.parse(out);
  return parsed.tool_name === 'Write' && parsed.tool_input.file_path === '/tmp/x.ts';
})());

assert('returns null for empty stdin', (() => {
  return run('') === 'null';
})());

assert('returns null for invalid JSON stdin', (() => {
  return run('{ not valid json') === 'null';
})());

assert('returns null for whitespace-only stdin', (() => {
  return run('   \n  ') === 'null';
})());

console.log(`\n=== lib/read-hook-input.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
