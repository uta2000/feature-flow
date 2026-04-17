#!/usr/bin/env node
'use strict';

/**
 * advisor-hint.js — SessionStart hook
 *
 * Runs on every session start. Checks five gate conditions; if all pass,
 * writes one banner line to stdout and updates the daily rate-limiter.
 *
 * Gate conditions (ALL must be true to show hint):
 *   1. .feature-flow.yml exists in cwd (this is a feature-flow project)
 *   2. advisor.enabled is not explicitly false in .feature-flow.yml
 *   3. No SUPPORTED_ADVISOR_HEADERS entry found in settings.json ANTHROPIC_BETA
 *   4. hints.advisor.dismissed is not true in .feature-flow.yml
 *   5. hint was not already shown today (rate limiter: once per calendar day)
 *
 * Model check: CLAUDE_MODEL env is checked but result is fail-open — if the
 * model cannot be detected, the hint is still eligible to show (condition passes).
 *
 * Always exits 0 — a hook failure must never block a session start.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Resolve CLAUDE_PLUGIN_ROOT for the advisor-headers import
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, '../..');
const { SUPPORTED_ADVISOR_HEADERS } = require(
  path.join(pluginRoot, 'skills/settings/scripts/advisor-headers.js')
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readYml() {
  const p = path.join(process.cwd(), '.feature-flow.yml');
  try { return fs.readFileSync(p, 'utf8'); }
  catch (_) { return null; }
}

function isAdvisorEnabled(ymlContent) {
  if (!ymlContent) return false; // No config → not a feature-flow project
  // advisor.enabled: false → disabled
  if (/^advisor:\s*\n(?:[ \t]+.*\n)*?[ \t]+enabled:\s*false/m.test(ymlContent)) return false;
  return true;
}

function isDismissed(ymlContent) {
  if (!ymlContent) return false;
  const advisorBlock = ymlContent.match(/hints:\s*\n(?:[ \t]+.*\n)*?[ \t]+advisor:\s*\n((?:[ \t]+.*\n)*)/);
  if (!advisorBlock) return false;
  return /dismissed:\s*true/.test(advisorBlock[1]);
}

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
  return path.join(home, '.claude', 'settings.json');
}

function isHeaderPresent() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const settings = JSON.parse(raw);
    const env = (settings && settings.env) || {};
    const betaValue = env.ANTHROPIC_BETA || env.anthropic_beta || '';
    if (typeof betaValue !== 'string' || !betaValue) return false;
    const parts = betaValue.split(',').map((s) => s.trim());
    return SUPPORTED_ADVISOR_HEADERS.some((h) => parts.includes(h));
  } catch (_) {
    return false;
  }
}

function getHintStatePath() {
  return path.join(os.homedir(), '.feature-flow', 'hint-state.json');
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function wasShownToday() {
  try {
    const raw = fs.readFileSync(getHintStatePath(), 'utf8');
    const state = JSON.parse(raw);
    return state.last_advisor_hint === todayStr();
  } catch (_) {
    return false;
  }
}

function markShownToday() {
  const p = getHintStatePath();
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const existing = (() => {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
      catch (_) { return {}; }
    })();
    existing.last_advisor_hint = todayStr();
    fs.writeFileSync(p, JSON.stringify(existing), 'utf8');
  } catch (_) {
    // Non-fatal — state update failure should not block the session
  }
}

// ─── Main gate function ───────────────────────────────────────────────────────

function shouldShowAdvisorHint() {
  const yml = readYml();
  if (!yml) return false;                   // Condition 1: feature-flow project
  if (!isAdvisorEnabled(yml)) return false; // Condition 2: not explicitly disabled
  if (isHeaderPresent()) return false;      // Condition 3: header already configured
  if (isDismissed(yml)) return false;       // Condition 4: permanently dismissed
  if (wasShownToday()) return false;        // Condition 5: daily rate-limiter
  return true;
}

module.exports = { shouldShowAdvisorHint };

// ─── Script entrypoint ────────────────────────────────────────────────────────

function main() {
  if (!shouldShowAdvisorHint()) return;

  console.log(
    '[feature-flow] Tip: enable the advisor beta header for a quality boost on complex tasks. ' +
    'Run `feature-flow:settings advisor` for details, or ' +
    '`feature-flow:settings advisor dismiss` to stop this tip.'
  );
  markShownToday();
}

try {
  main();
} catch (e) {
  const detail = e instanceof Error ? e.message : String(e);
  process.stderr.write(`[feature-flow] advisor-hint hook error: ${detail}\n`);
}
// Always exit 0 — this hook is advisory only.
process.exit(0);
