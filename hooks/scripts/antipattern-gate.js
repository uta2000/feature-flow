#!/usr/bin/env node
'use strict';

const { readHookInput } = require('./lib/read-hook-input');

const SRC_FILE = /\/src\/.*\.(ts|tsx|js|jsx)$/;
const TEST_FILE = /\.(test|spec|d)\.(ts|tsx|js|jsx)$/;
const TYPES_DIR = /\/types\//;

function isCoveredFile(f) {
  return SRC_FILE.test(f) && !TEST_FILE.test(f) && !TYPES_DIR.test(f);
}

function findAntiPatterns(lines, withLineNumbers) {
  const findings = [];
  lines.forEach((line, idx) => {
    const prefix = withLineNumbers ? `L${idx + 1}: ` : '';
    if (/:\s*any\b/.test(line) && !/\/\//.test(line.split('any')[0])) {
      findings.push(`${prefix}\`any\` type — use a specific type or \`unknown\``);
    }
    if (/\bas\s+any\b/.test(line) && !/\/\//.test(line.split('as')[0])) {
      findings.push(`${prefix}\`as any\` — use a proper type assertion`);
    }
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
      findings.push(`${prefix}empty catch block — handle or rethrow the error`);
    }
  });
  return findings;
}

function deny(reason) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
}

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const toolName = payload.tool_name || '';
  const toolInput = payload.tool_input || {};
  const filePath = toolInput.file_path || '';
  if (!isCoveredFile(filePath)) process.exit(0);

  let text, withLineNumbers;
  if (toolName === 'Write') {
    text = toolInput.content || '';
    withLineNumbers = true;
  } else if (toolName === 'Edit') {
    text = toolInput.new_string || '';
    withLineNumbers = false;
  } else {
    process.exit(0);
  }

  const findings = findAntiPatterns(text.split('\n'), withLineNumbers);
  if (findings.length === 0) process.exit(0);

  const verb = toolName === 'Write' ? 'writing' : 'editing';
  const name = filePath.split('/').pop();
  deny(`Fix these anti-patterns before ${verb} ${name}:\n${findings.join('\n')}`);
  process.exit(0);
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[antipattern-gate] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
