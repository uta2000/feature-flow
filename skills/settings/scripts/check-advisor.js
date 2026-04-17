#!/usr/bin/env node
'use strict';

/**
 * check-advisor.js
 *
 * Reads the user's Claude Code settings.json (OS-specific path) and the local
 * .feature-flow.yml to determine advisor configuration state.
 *
 * Outputs a single JSON object to stdout:
 *   { sonnet: boolean|null, header_present: boolean, dismissed: boolean }
 *
 * Fields:
 *   sonnet        — true if CLAUDE_MODEL env suggests Sonnet 4.x; null if undetectable
 *                   (fail-open: treat null as eligible for hint)
 *   header_present — true if any SUPPORTED_ADVISOR_HEADERS entry found in ANTHROPIC_BETA
 *   dismissed     — true if hints.advisor.dismissed: true in .feature-flow.yml
 *
 * Always exits 0 — errors are logged to stderr and produce safe defaults.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const { SUPPORTED_ADVISOR_HEADERS } = require('./advisor-headers.js');

// ─── Platform-specific settings.json path ────────────────────────────────────

function getSettingsPath() {
  const platform = process.platform;
  const home = os.homedir();

  if (platform === 'win32') {
    const appdata = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appdata, 'claude', 'settings.json');
  }
  if (platform === 'linux') {
    const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
    const xdgPath = path.join(xdgConfig, 'claude', 'settings.json');
    if (fs.existsSync(xdgPath)) return xdgPath;
  }
  // macOS and linux fallback
  return path.join(home, '.claude', 'settings.json');
}

// ─── Read settings.json ───────────────────────────────────────────────────────

function readSettings() {
  const p = getSettingsPath();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

// ─── Detect advisor header in settings.json ───────────────────────────────────

function detectHeaderPresent(settings) {
  if (!settings || typeof settings !== 'object') return false;
  const env = settings.env || {};
  // ANTHROPIC_BETA may be a comma-separated string of header values
  const betaValue = env.ANTHROPIC_BETA || env.anthropic_beta || '';
  if (typeof betaValue !== 'string' || !betaValue) return false;
  const parts = betaValue.split(',').map((s) => s.trim());
  return SUPPORTED_ADVISOR_HEADERS.some((h) => parts.includes(h));
}

// ─── Read .feature-flow.yml for dismissed flag ────────────────────────────────

function readDismissed() {
  const ymlPath = path.join(process.cwd(), '.feature-flow.yml');
  try {
    const raw = fs.readFileSync(ymlPath, 'utf8');
    // Parse hints.advisor.dismissed: true without a full YAML parser
    // Match:  dismissed: true   anywhere after "advisor:" section
    const advisorBlock = raw.match(/hints:\s*\n(?:[ \t]+.*\n)*?[ \t]+advisor:\s*\n((?:[ \t]+.*\n)*)/);
    if (!advisorBlock) return false;
    const block = advisorBlock[1];
    return /dismissed:\s*true/.test(block);
  } catch (_) {
    return false;
  }
}

// ─── Detect model (fail-open) ─────────────────────────────────────────────────

function detectSonnet() {
  const model = process.env.CLAUDE_MODEL || '';
  if (!model) return null; // undetectable — fail-open (treat as eligible)
  return /sonnet/i.test(model);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const settings = readSettings();
  const result = {
    sonnet: detectSonnet(),
    header_present: detectHeaderPresent(settings),
    dismissed: readDismissed(),
  };
  process.stdout.write(JSON.stringify(result) + '\n');
}

try {
  main();
} catch (e) {
  const detail = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[feature-flow] check-advisor error: ${detail}\n`);
  // Fail-open: output safe defaults
  process.stdout.write(JSON.stringify({ sonnet: null, header_present: false, dismissed: false }) + '\n');
}
process.exit(0);
