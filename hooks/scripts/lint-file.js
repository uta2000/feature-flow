#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');
const { readHookInput } = require('./lib/read-hook-input');

function main() {
  const payload = readHookInput();
  if (!payload) process.exit(0);

  const filePath = payload.tool_input?.file_path || '';
  if (!isSourceFile(filePath)) process.exit(0);

  const result = runLinter(filePath);
  if (result) {
    const name = path.basename(filePath);
    const context = result.failedToRun
      ? `[feature-flow] LINT DID NOT RUN for ${name} — the ${result.linter} linter failed to start (${result.detail}). Lint status is unknown; this is NOT a clean result. Investigate before relying on lint here.`
      : `[feature-flow] LINT ERRORS in ${name} — fix these before continuing:\n${result.output}`;
    console.log(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: context,
      },
    }));
  }
  process.exit(0);
}

function isSourceFile(f) {
  if (!/\.(ts|tsx|js|jsx)$/.test(f)) return false;
  if (/\.(test|spec|d)\.(ts|tsx|js|jsx)$/.test(f)) return false;
  if (/(^|\/)(node_modules|\.next|dist|build|\.git)(\/|$)/.test(f)) return false;
  return true;
}

function runLinter(filePath) {
  const linters = [
    { bin: 'eslint', args: ['eslint', filePath], detect: hasEslintConfig },
    { bin: 'biome', args: ['biome', 'check', filePath], detect: hasBiomeConfig },
  ];

  for (const { bin, args, detect } of linters) {
    if (!existsSync(`node_modules/.bin/${bin}`) || !detect()) continue;
    const result = spawnSync('npx', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0) return null;
    // The linter could not run: the binary failed to spawn (result.error, e.g.
    // ENOENT/EACCES) or was killed by a signal (result.signal). Surface this as an
    // advisory rather than returning null — a silent null is indistinguishable from
    // "lint clean" and hides that the check never actually ran.
    if (result.error || result.signal) {
      const detail = result.error
        ? (result.error.code || result.error.message || 'spawn error')
        : `killed by signal ${result.signal}`;
      return { failedToRun: true, linter: bin, detail };
    }
    return { failedToRun: false, output: (result.stdout || result.stderr || 'Lint errors found').trim() };
  }

  return null;
}

function hasEslintConfig() {
  return [
    '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json',
    '.eslintrc.yml', '.eslintrc.yaml',
    'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  ].some(c => existsSync(c));
}

function hasBiomeConfig() {
  return existsSync('biome.json') || existsSync('biome.jsonc');
}

try {
  main();
} catch (err) {
  try { process.stderr.write('[lint-file] fail-open due to internal error: ' + (err && err.message) + '\n'); } catch (_) { /* stderr unavailable */ }
  process.exit(0);
}
