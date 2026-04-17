#!/usr/bin/env node
'use strict';

/**
 * Tests for hooks/scripts/advisor-hint.js
 *
 * Tests the shouldShowAdvisorHint() gate and banner output.
 * Follows version-check.test.js / verdict-gate.test.js patterns.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const SCRIPT = path.resolve(__dirname, 'advisor-hint.js');

let passed = 0, failed = 0;

function assert(name, cond) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.error(`  FAIL: ${name}`); failed++; }
}

function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'advisor-hint-test-')); }

function writeYml(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

function writeHintState(homeDir, content) {
  const stateDir = path.join(homeDir, '.feature-flow');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'hint-state.json'), JSON.stringify(content), 'utf8');
}

function writeSettings(homeDir, content) {
  const dir = path.join(homeDir, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify(content), 'utf8');
}

/**
 * Run advisor-hint.js as a subprocess in the given cwd with overridden HOME.
 * Returns { exitCode, stdout, stderr }.
 */
function run(env = {}, cwd = null) {
  const mergedEnv = { ...process.env, ...env };
  if (env.CLAUDE_PLUGIN_ROOT === '__UNSET__') delete mergedEnv.CLAUDE_PLUGIN_ROOT;
  // Prevent bleed-through of the developer's real settings.json on Linux/Windows:
  // delete XDG_CONFIG_HOME and APPDATA so getSettingsPath() falls back to HOME-relative.
  // Callers can re-set these via the env arg if a specific test needs them.
  if (!('XDG_CONFIG_HOME' in env)) delete mergedEnv.XDG_CONFIG_HOME;
  if (!('APPDATA' in env)) delete mergedEnv.APPDATA;
  // Also null out CLAUDE_MODEL unless explicitly set — the Sonnet gate should
  // fail-open (null → eligible) when the env lacks it, not silently pick up
  // the developer's machine setting.
  if (!('CLAUDE_MODEL' in env)) delete mergedEnv.CLAUDE_MODEL;
  try {
    const stdout = execSync(`node "${SCRIPT}"`, {
      env: mergedEnv,
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, stdout };
  } catch (e) {
    return { exitCode: e.status || 1, stdout: e.stdout || '', stderr: e.stderr || '' };
  }
}

// Today's date in YYYY-MM-DD format
function today() {
  return new Date().toISOString().slice(0, 10);
}

function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ─── Happy path: all conditions met → hint shown ───────────────────────────────

console.log('\n=== Happy path: hint shown ===');

assert('shows hint when no header, not dismissed, not disabled, no rate-limit entry', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('[feature-flow]') && stdout.includes('advisor');
})());

// ─── Gate conditions: each must suppress hint independently ───────────────────

console.log('\n=== Gate conditions: each suppresses hint ===');

assert('no hint when advisor header is present in settings.json', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  writeSettings(home, { env: { ANTHROPIC_BETA: 'advisor-tool-2026-03-01' } });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return !stdout.includes('advisor') || stdout.trim() === '';
})());

assert('no hint when hints.advisor.dismissed: true in .feature-flow.yml', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'hints:\n  advisor:\n    dismissed: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

assert('no hint when advisor.enabled: false in .feature-flow.yml', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: false\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

assert('no hint when rate-limiter shows hint already shown today', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  writeHintState(home, { last_advisor_hint: today() });
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

assert('no hint when .feature-flow.yml is absent (not a feature-flow project)', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  // No .feature-flow.yml
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

assert('no hint when CLAUDE_MODEL is a non-Sonnet model (e.g. Haiku)', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home, CLAUDE_MODEL: 'claude-haiku-4-5' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.trim() === '';
})());

assert('shows hint when CLAUDE_MODEL is a Sonnet model', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home, CLAUDE_MODEL: 'claude-sonnet-4-6' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('[feature-flow]');
})());

// ─── Rate limiter: shows hint when last entry is yesterday ────────────────────

console.log('\n=== Rate limiter: shows hint after 1 day ===');

assert('shows hint when last_advisor_hint was yesterday', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  writeHintState(home, { last_advisor_hint: yesterday() });
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('[feature-flow]');
})());

// ─── Rate limiter: hint-state.json updated after showing ──────────────────────

console.log('\n=== Rate limiter: state written after hint ===');

assert('hint-state.json last_advisor_hint set to today after showing hint', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  run({ HOME: home }, tmp);
  const stateFile = path.join(home, '.feature-flow', 'hint-state.json');
  let updated;
  try { updated = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (_) { updated = null; }
  fs.rmSync(tmp, { recursive: true });
  return updated !== null && updated.last_advisor_hint === today();
})());

// ─── Exit code is always 0 ────────────────────────────────────────────────────

console.log('\n=== Exit code ===');

assert('exits 0 in all conditions', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const { exitCode } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return exitCode === 0;
})());

// ─── Banner content ───────────────────────────────────────────────────────────

console.log('\n=== Banner content ===');

assert('banner line mentions feature-flow:settings advisor', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('feature-flow:settings advisor');
})());

assert('banner line mentions dismiss option', (() => {
  const tmp = mkTmp();
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  writeYml(tmp, 'advisor:\n  enabled: true\n');
  const { stdout } = run({ HOME: home }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return stdout.includes('dismiss');
})());

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
