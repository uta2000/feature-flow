#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { readHookInput } = require('./lib/read-hook-input');

const SRC_FILE = /\/src\/.*\.(ts|tsx|js|jsx|py|rb|go|rs)$/;
const TEST_FILE = /\.(test|spec|d)\.(ts|tsx|js|jsx)$/;
const TYPES_DIR = /\/types\//;

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!SRC_FILE.test(filePath)) process.exit(0);
  if (TEST_FILE.test(filePath) || TYPES_DIR.test(filePath)) process.exit(0);
  if (!fs.existsSync('.feature-flow.yml')) process.exit(0);

  const yml = fs.readFileSync('.feature-flow.yml', 'utf8');
  if (!yml.includes('context7:')) process.exit(0);

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        '[feature-flow] REQUIRED: Before creating this source file, you MUST have queried Context7 docs ' +
        'for current patterns. Read the context7 field in .feature-flow.yml for library IDs, then query ' +
        'relevant libraries using mcp__plugin_context7_context7__query-docs.',
    },
  }));
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[context7-reminder] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
