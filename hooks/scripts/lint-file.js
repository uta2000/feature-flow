#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

let data = '';
process.stdin.on('data', chunk => (data += chunk));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path || '';
    if (!isSourceFile(filePath)) process.exit(0);

    const errors = runLinter(filePath);
    if (errors) {
      const name = path.basename(filePath);
      console.log(
        `[spec-driven] LINT ERRORS in ${name} — fix these before continuing:\n${errors}`
      );
    }
  } catch {
    // Silent — never crash the hook system
  }
  process.exit(0);
});

function isSourceFile(f) {
  if (!/\.(ts|tsx|js|jsx)$/.test(f)) return false;
  if (/\.(test|spec|d)\.(ts|tsx|js|jsx)$/.test(f)) return false;
  if (/(^|\/)(node_modules|\.next|dist|build|\.git)(\/|$)/.test(f)) return false;
  return true;
}

function runLinter(filePath) {
  if (existsSync('node_modules/.bin/eslint') && hasEslintConfig()) {
    const result = spawnSync('npx', ['eslint', filePath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0) return null;
    return (result.stdout || result.stderr || 'Lint errors found').trim();
  }

  if (existsSync('node_modules/.bin/biome') && hasBiomeConfig()) {
    const result = spawnSync('npx', ['biome', 'check', filePath], {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (result.status === 0) return null;
    return (result.stdout || result.stderr || 'Lint errors found').trim();
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
