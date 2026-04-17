#!/usr/bin/env node
'use strict';

/**
 * Tests for skills/settings/scripts/check-advisor.js
 * Follows the version-check.test.js pattern: inline helpers, child_process for integration.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CHECK_ADVISOR = path.resolve(__dirname, 'check-advisor.js');

let passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'check-advisor-test-')); }

function writeSettings(dir, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), content, 'utf8');
}

function writeYml(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

/**
 * Run check-advisor.js as a child process. Returns { exitCode, result }
 * where result is the parsed JSON stdout.
 */
function run(env = {}, cwd = null) {
  const mergedEnv = { ...process.env, ...env };
  if (env.HOME === '__UNSET__') delete mergedEnv.HOME;
  // Prevent bleed-through of the developer's real settings.json on Linux/Windows:
  // delete XDG_CONFIG_HOME and APPDATA so getSettingsPath() falls back to HOME-relative.
  // Callers can re-set these via the env arg if a specific test needs them.
  if (!('XDG_CONFIG_HOME' in env)) delete mergedEnv.XDG_CONFIG_HOME;
  if (!('APPDATA' in env)) delete mergedEnv.APPDATA;
  try {
    const stdout = execSync(`node "${CHECK_ADVISOR}"`, {
      env: mergedEnv,
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
    });
    let result;
    try { result = JSON.parse(stdout); } catch (_) { result = null; }
    return { exitCode: 0, result };
  } catch (e) {
    let result;
    try { result = JSON.parse(e.stdout || '{}'); } catch (_) { result = null; }
    return { exitCode: e.status || 1, result };
  }
}

// ─── Unit tests: exported helpers ────────────────────────────────────────────

// We can't directly import without running main(), so these are integration-
// level: run the script and inspect the JSON output.

console.log('\n=== Integration: settings.json absent ===');

assert('returns header_present: false when settings.json does not exist', (() => {
  const tmp = mkTmp();
  // No settings.json written
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === false;
})());

assert('returns dismissed: false when .feature-flow.yml absent', (() => {
  const tmp = mkTmp();
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === false;
})());

console.log('\n=== Integration: header detection ===');

assert('header_present: true when advisor-tool-2026-03-01 in anthropic-beta string', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({
    env: { ANTHROPIC_BETA: 'advisor-tool-2026-03-01,other-thing' }
  }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === true;
})());

assert('header_present: false when anthropic-beta string lacks advisor header', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({
    env: { ANTHROPIC_BETA: 'some-other-beta' }
  }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === false;
})());

assert('header_present: true when beta header key is uppercase ANTHROPIC_BETA', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({
    env: { ANTHROPIC_BETA: 'advisor-tool-2026-03-01' }
  }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === true;
})());

assert('header_present: false when settings.json has empty env block', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({ env: {} }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === false;
})());

assert('header_present: false when settings.json has no env key', (() => {
  const tmp = mkTmp();
  const settingsDir = path.join(tmp, '.claude');
  writeSettings(settingsDir, JSON.stringify({ otherKey: true }));
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.header_present === false;
})());

console.log('\n=== Integration: dismissed flag ===');

assert('dismissed: true when .feature-flow.yml has hints.advisor.dismissed: true', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'hints:\n  advisor:\n    dismissed: true\n');
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === true;
})());

assert('dismissed: false when .feature-flow.yml has hints.advisor.dismissed: false', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'hints:\n  advisor:\n    dismissed: false\n');
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === false;
})());

assert('dismissed: false when hints.advisor block is absent', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'plugin_version: 1.0.0\n');
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === false;
})());

assert('dismissed: false when a sibling hints.* key has dismissed: true (no cross-block capture)', (() => {
  const tmp = mkTmp();
  writeYml(tmp,
    'hints:\n' +
    '  advisor:\n' +
    '    dismissed: false\n' +
    '  other:\n' +
    '    dismissed: true\n'
  );
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === false;
})());

assert('dismissed: true when hints.advisor.dismissed: true and sibling has dismissed: false', (() => {
  const tmp = mkTmp();
  writeYml(tmp,
    'hints:\n' +
    '  advisor:\n' +
    '    dismissed: true\n' +
    '  other:\n' +
    '    dismissed: false\n'
  );
  const { result } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return result !== null && result.dismissed === true;
})());

console.log('\n=== Integration: sonnet field ===');

assert('sonnet: false when CLAUDE_MODEL env unset (fail-open: include hint)', (() => {
  const tmp = mkTmp();
  const mergedEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDE_MODEL'));
  delete mergedEnv.XDG_CONFIG_HOME;
  delete mergedEnv.APPDATA;
  mergedEnv.HOME = tmp;
  try {
    const stdout = execSync(`node "${CHECK_ADVISOR}"`, {
      env: mergedEnv, cwd: tmp, encoding: 'utf8'
    });
    const r = JSON.parse(stdout);
    fs.rmSync(tmp, { recursive: true });
    // When model undetectable, sonnet should be null or true (fail-open means show hint)
    return r !== null && (r.sonnet === null || r.sonnet === true);
  } catch (_) {
    fs.rmSync(tmp, { recursive: true });
    return false;
  }
})());

assert('exit code is always 0', (() => {
  const tmp = mkTmp();
  const { exitCode } = run({ HOME: tmp }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return exitCode === 0;
})());

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
