#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { readHookInput } = require('./lib/read-hook-input');

const SRC_FILE = /\/src\/.*\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.(test|spec|d)\.(ts|tsx|js|jsx)$/;
const TYPES_DIR = /\/types\//;

function isCoveredFile(f) {
  return SRC_FILE.test(f) && !TEST_FILE.test(f) && !TYPES_DIR.test(f);
}

function hasConsoleWarn(line) {
  return /console\.(log|debug)\(/.test(line) && !/\/\//.test(line.split('console')[0]);
}

function advise(context) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: context,
    },
  }));
}

function scanFileForConsoleWarn(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  const warnings = [];
  content.split('\n').forEach((line, idx) => {
    if (hasConsoleWarn(line)) warnings.push(`L${idx + 1}: console.log/debug`);
  });
  return warnings;
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!isCoveredFile(filePath)) process.exit(0);

  const name = filePath.split('/').pop();

  if (toolName === 'Write') {
    const warnings = scanFileForConsoleWarn(filePath);
    if (!warnings || warnings.length === 0) process.exit(0);
    advise(`[feature-flow] Debug statements in ${name}:\n${warnings.join('\n')}\nRemember to remove before self-review.`);
  } else if (toolName === 'Edit') {
    const newString = toolInput.new_string || '';
    const hit = newString.split('\n').some(hasConsoleWarn);
    if (!hit) process.exit(0);
    advise(`[feature-flow] console.log/debug added in ${name}. Remember to remove before self-review.`);
  }

  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[console-warn] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
