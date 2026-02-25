#!/usr/bin/env node
'use strict';

/**
 * Test suite for version-check.js
 * Verifies all acceptance criteria from the task description.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const SCRIPT = path.join(__dirname, 'version-check.js');

// ---------------------------------------------------------------------------
// Inline the unit-testable functions directly (avoid re-running main)
// ---------------------------------------------------------------------------

function parseSemver(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function classifyDrift(stored, running) {
  if (stored.major !== running.major) return 'major';
  if (stored.minor !== running.minor) return 'minor';
  if (stored.patch !== running.patch) return 'patch';
  return null;
}

function readPluginVersion(content) {
  const match = content.match(/^plugin_version:\s*(.+)$/m);
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
}

function stampVersion(content, version) {
  if (/^plugin_version:/m.test(content)) {
    return content.replace(/^plugin_version:\s*.+$/m, `plugin_version: ${version}`);
  }
  return `plugin_version: ${version}\n${content}`;
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  PASS: ${desc}`);
    passed++;
  } else {
    console.error(`  FAIL: ${desc}`);
    failed++;
  }
}

function runScript(env = {}, cwd = null) {
  const mergedEnv = { ...process.env, ...env };
  // Remove CLAUDE_PLUGIN_ROOT if caller explicitly sets it to undefined sentinel
  if (env.CLAUDE_PLUGIN_ROOT === '__UNSET__') {
    delete mergedEnv.CLAUDE_PLUGIN_ROOT;
  }
  try {
    const result = execSync(`node "${SCRIPT}"`, {
      env: mergedEnv,
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout: result, stderr: '', exitCode: 0 };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', exitCode: e.status || 1 };
  }
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'version-check-test-'));
}

function writeConfig(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

function readConfig(dir) {
  return fs.readFileSync(path.join(dir, '.feature-flow.yml'), 'utf8');
}

// ---------------------------------------------------------------------------
// Unit tests: parseSemver
// ---------------------------------------------------------------------------

console.log('\n=== parseSemver() ===');

assert('parses "1.2.3" correctly', (() => {
  const r = parseSemver('1.2.3');
  return r && r.major === 1 && r.minor === 2 && r.patch === 3;
})());

assert('parses "0.0.0" correctly', (() => {
  const r = parseSemver('0.0.0');
  return r && r.major === 0 && r.minor === 0 && r.patch === 0;
})());

assert('returns null for "abc"', parseSemver('abc') === null);
assert('returns null for ""', parseSemver('') === null);
assert('returns null for "1.2" (missing patch)', parseSemver('1.2') === null);
assert('returns null for "1.2.x"', parseSemver('1.2.x') === null);

// ---------------------------------------------------------------------------
// Unit tests: classifyDrift
// ---------------------------------------------------------------------------

console.log('\n=== classifyDrift() ===');

assert('returns "major" when majors differ', (() => {
  const a = parseSemver('1.0.0');
  const b = parseSemver('2.0.0');
  return classifyDrift(a, b) === 'major';
})());

assert('returns "minor" when minors differ', (() => {
  const a = parseSemver('1.0.0');
  const b = parseSemver('1.1.0');
  return classifyDrift(a, b) === 'minor';
})());

assert('returns "patch" when patches differ', (() => {
  const a = parseSemver('1.0.0');
  const b = parseSemver('1.0.1');
  return classifyDrift(a, b) === 'patch';
})());

assert('returns null for equal versions', (() => {
  const a = parseSemver('1.2.3');
  const b = parseSemver('1.2.3');
  return classifyDrift(a, b) === null;
})());

// ---------------------------------------------------------------------------
// Unit tests: readPluginVersion
// ---------------------------------------------------------------------------

console.log('\n=== readPluginVersion() ===');

assert('extracts unquoted version', readPluginVersion('plugin_version: 1.2.3\nother: val') === '1.2.3');
assert('extracts single-quoted version', readPluginVersion("plugin_version: '1.2.3'\n") === '1.2.3');
assert('extracts double-quoted version', readPluginVersion('plugin_version: "1.2.3"\n') === '1.2.3');
assert('returns null when field absent', readPluginVersion('some_key: value\nother: x') === null);

// ---------------------------------------------------------------------------
// Unit tests: stampVersion
// ---------------------------------------------------------------------------

console.log('\n=== stampVersion() ===');

assert('replaces existing plugin_version line', (() => {
  const content = 'plugin_version: 1.0.0\nother: val\n';
  const result = stampVersion(content, '1.2.3');
  return result === 'plugin_version: 1.2.3\nother: val\n';
})());

assert('prepends plugin_version when absent', (() => {
  const content = 'some_key: value\n';
  const result = stampVersion(content, '1.2.3');
  return result === 'plugin_version: 1.2.3\nsome_key: value\n';
})());

assert('returns same content when version already matches (no diff)', (() => {
  const content = 'plugin_version: 1.2.3\nother: val\n';
  const result = stampVersion(content, '1.2.3');
  return result === content;
})());

// ---------------------------------------------------------------------------
// Integration tests: script invocation
// ---------------------------------------------------------------------------

console.log('\n=== Integration: silent exit conditions ===');

// No config file present
assert('exits silently when .feature-flow.yml does not exist', (() => {
  const tmp = makeTmpDir();
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/some/path/1.2.3' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && r.stdout.trim() === '';
})());

// CLAUDE_PLUGIN_ROOT not set
assert('exits silently when CLAUDE_PLUGIN_ROOT is not set', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.0.0\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '__UNSET__' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && r.stdout.trim() === '';
})());

// CLAUDE_PLUGIN_ROOT ends in non-semver
assert('exits silently when CLAUDE_PLUGIN_ROOT path does not end in valid semver', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.0.0\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/some/path/notasemver' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && r.stdout.trim() === '';
})());

console.log('\n=== Integration: upgrade notice output ===');

// Major drift
assert('prints upgrade notice with "Major" label for major drift', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.0.0\nother: val\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/plugins/feature-flow/2.0.0' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 &&
    r.stdout.includes('UPGRADE NOTICE:') &&
    r.stdout.includes('Major') &&
    r.stdout.includes('v1.0.0') &&
    r.stdout.includes('v2.0.0');
})());

// Minor drift
assert('prints upgrade notice with "Minor" label for minor drift', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.0.0\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/plugins/feature-flow/1.1.0' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 &&
    r.stdout.includes('UPGRADE NOTICE:') &&
    r.stdout.includes('Minor') &&
    r.stdout.includes('v1.0.0') &&
    r.stdout.includes('v1.1.0');
})());

// Patch drift
assert('prints upgrade notice with "Patch" label for patch drift', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.0.0\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/plugins/feature-flow/1.0.1' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 &&
    r.stdout.includes('UPGRADE NOTICE:') &&
    r.stdout.includes('Patch') &&
    r.stdout.includes('v1.0.0') &&
    r.stdout.includes('v1.0.1');
})());

// Equal versions — no notice
assert('no notice printed when stored version equals running version', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.2.3\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/plugins/feature-flow/1.2.3' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 && !r.stdout.includes('UPGRADE NOTICE:');
})());

// First-time (no plugin_version field) — no notice, version stamped
assert('no notice when plugin_version absent (first-time); version is stamped', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'some_key: value\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/plugins/feature-flow/1.5.0' }, tmp);
  const after = readConfig(tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 &&
    !r.stdout.includes('UPGRADE NOTICE:') &&
    after.includes('plugin_version: 1.5.0');
})());

console.log('\n=== Integration: version stamping ===');

// Config is updated with running version after drift
assert('config file is updated to running version after drift', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.0.0\nother: val\n');
  runScript({ CLAUDE_PLUGIN_ROOT: '/plugins/feature-flow/2.0.0' }, tmp);
  const after = readConfig(tmp);
  fs.rmSync(tmp, { recursive: true });
  return after.includes('plugin_version: 2.0.0') && !after.includes('plugin_version: 1.0.0');
})());

// Config already has matching version — file not unnecessarily rewritten
assert('config file unchanged when version already matches', (() => {
  const tmp = makeTmpDir();
  const original = 'plugin_version: 1.2.3\nother: val\n';
  writeConfig(tmp, original);
  runScript({ CLAUDE_PLUGIN_ROOT: '/plugins/feature-flow/1.2.3' }, tmp);
  const after = readConfig(tmp);
  fs.rmSync(tmp, { recursive: true });
  return after === original;
})());

// Notice includes CHANGELOG.md reference
assert('upgrade notice mentions CHANGELOG.md', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.0.0\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/plugins/feature-flow/2.0.0' }, tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.stdout.includes('CHANGELOG.md');
})());

console.log('\n=== Integration: getRunningVersion from real path ===');

assert('extracts version from path like /Users/.../feature-flow/1.19.2', (() => {
  const tmp = makeTmpDir();
  writeConfig(tmp, 'plugin_version: 1.18.0\n');
  const r = runScript({ CLAUDE_PLUGIN_ROOT: '/Users/weee/.claude/plugins/cache/feature-flow/feature-flow/1.19.2' }, tmp);
  const after = readConfig(tmp);
  fs.rmSync(tmp, { recursive: true });
  return r.exitCode === 0 &&
    r.stdout.includes('UPGRADE NOTICE:') &&
    r.stdout.includes('Minor') &&
    after.includes('plugin_version: 1.19.2');
})());

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
