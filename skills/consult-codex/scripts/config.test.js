#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');

let passed = 0, failed = 0;
function assert(name, cond) {
  if (cond) { console.log(`  ok — ${name}`); passed++; }
  else { console.log(`  FAIL — ${name}`); failed++; }
}
function mkTmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-cfg-')); }
function writeYml(dir, content) {
  fs.writeFileSync(path.join(dir, '.feature-flow.yml'), content, 'utf8');
}

console.log('=== config.js ===');

assert('returns disabled when .feature-flow.yml missing', (() => {
  const tmp = mkTmp();
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.enabled === false;
})());

assert('returns disabled when codex section missing', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'plugin_version: 1.0.0\nstack:\n  - node-js\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.enabled === false;
})());

assert('parses codex.enabled: true', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n  model: gpt-5.2\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.enabled === true && c.model === 'gpt-5.2';
})());

assert('parses quoted model value without retaining quotes', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n  model: "gpt-5.2"\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.model === 'gpt-5.2';
})());

assert('parses single-quoted model value without retaining quotes', (() => {
  const tmp = mkTmp();
  writeYml(tmp, "codex:\n  enabled: true\n  model: 'gpt-5.2'\n");
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.model === 'gpt-5.2';
})());

assert('parses proactive review flags with defaults', (() => {
  const tmp = mkTmp();
  writeYml(tmp, [
    'codex:',
    '  enabled: true',
    '  proactive_reviews:',
    '    design_doc: true',
    '    plan_criteria: false',
    '    pre_harden: true',
    ''
  ].join('\n'));
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.proactive_reviews.design_doc === true &&
         c.proactive_reviews.plan_criteria === false &&
         c.proactive_reviews.pre_harden === true;
})());

assert('applies built-in defaults when proactive_reviews is absent', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  // default: all proactive reviews true when enabled
  return c.proactive_reviews.design_doc === true &&
         c.proactive_reviews.plan_criteria === true &&
         c.proactive_reviews.pre_harden === true;
})());

assert('parses timeout_seconds with fallback default 180', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n  timeout_seconds: 60\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.timeout_seconds === 60;
})());

assert('default timeout_seconds is 180', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  return c.timeout_seconds === 180;
})());

assert('weird-indent yaml does not throw', (() => {
  const tmp = mkTmp();
  writeYml(tmp, 'codex:\n  enabled: true\n    bogus_indent: 1\n');
  const c = config.load(tmp);
  fs.rmSync(tmp, { recursive: true });
  // loader is intentionally lenient — drops unrecognized lines silently.
  // This test verifies it does not throw, which is the disabled-safe invariant.
  return typeof c.enabled === 'boolean';
})());

console.log(`\n=== config.js: ${passed} passed, ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
